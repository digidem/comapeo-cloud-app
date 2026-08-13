import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  type CloudflareRateLimitRule,
  type MeasurementReport,
  PRODUCTION_TILE_HOST,
  PRODUCTION_ZONE_NAME,
  type RateLimitMode,
  TILE_RATE_LIMIT_RULE_REF,
  buildCloudflareRateLimitRule,
  buildMeasurementReport,
  findRuleByRef,
  summarizeHarSample,
  validateEnforcementReadiness,
  validateProductionMeasurementTarget,
  validateProductionZoneName,
} from './lib/tile-rate-limit';

const API_BASE = 'https://api.cloudflare.com/client/v4';
const PHASE = 'http_ratelimit';

interface CloudflareEnvelope<T> {
  success: boolean;
  result: T;
  errors?: Array<{ code?: number; message?: string }>;
  messages?: Array<{ code?: number; message?: string }>;
}

interface CloudflareRule extends Partial<CloudflareRateLimitRule> {
  id?: string;
  ref?: string;
  enabled?: boolean;
}

interface CloudflareRuleset {
  id: string;
  rules?: CloudflareRule[];
}

interface CliOptions {
  command: string;
  values: Map<string, string | boolean>;
}

function usage(): never {
  console.error(`Usage:
  npm run ops:tile-rate-limit -- measure --small <small.har> --large <large.har> --output <report.json> [--host app.comapeo.cloud] [--period 60] [--safety 1.5]
  npm run ops:tile-rate-limit -- render --report <report.json> [--mode observe|enforce] [--threshold N] [--confirm-false-positive-validation]
  npm run ops:tile-rate-limit -- apply --report <report.json> [--mode observe|enforce] [--threshold N] [--zone comapeo.cloud] [--confirm-false-positive-validation]
  npm run ops:tile-rate-limit -- status [--zone comapeo.cloud]
  npm run ops:tile-rate-limit -- disable [--zone comapeo.cloud]

Cloudflare apply/status/disable require CLOUDFLARE_API_TOKEN. Enforcement also
requires a measurement report with both small and large SMP samples plus the
explicit --confirm-false-positive-validation flag.`);
  process.exit(2);
}

function parseArgs(argv: string[]): CliOptions {
  const [command, ...rest] = argv;
  if (!command) return usage();
  const values = new Map<string, string | boolean>();
  for (let index = 0; index < rest.length; index += 1) {
    const current = rest[index];
    if (!current?.startsWith('--')) return usage();
    const key = current.slice(2);
    const next = rest[index + 1];
    if (!next || next.startsWith('--')) {
      values.set(key, true);
      continue;
    }
    values.set(key, next);
    index += 1;
  }
  return { command, values };
}

function stringOption(
  values: Map<string, string | boolean>,
  key: string,
  fallback?: string,
): string {
  const value = values.get(key);
  if (value === undefined) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required --${key}`);
  }
  if (typeof value !== 'string') throw new Error(`--${key} requires a value`);
  return value;
}

function numberOption(
  values: Map<string, string | boolean>,
  key: string,
  fallback?: number,
): number {
  const raw = values.get(key);
  if (raw === undefined) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required --${key}`);
  }
  if (typeof raw !== 'string') throw new Error(`--${key} requires a number`);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) throw new Error(`--${key} must be a number`);
  return parsed;
}

function booleanOption(
  values: Map<string, string | boolean>,
  key: string,
): boolean {
  return values.get(key) === true;
}

function modeOption(values: Map<string, string | boolean>): RateLimitMode {
  const mode = stringOption(values, 'mode', 'observe');
  if (mode !== 'observe' && mode !== 'enforce') {
    throw new Error('--mode must be observe or enforce');
  }
  return mode;
}

function productionZoneOption(values: Map<string, string | boolean>): string {
  const zoneName = stringOption(values, 'zone', PRODUCTION_ZONE_NAME);
  validateProductionZoneName(zoneName);
  return zoneName;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve(path), 'utf8')) as unknown;
}

async function readReport(path: string): Promise<MeasurementReport> {
  const report = (await readJson(path)) as MeasurementReport;
  if (!report || report.schemaVersion !== 1 || !report.target) {
    throw new Error('Invalid tile-rate-limit measurement report');
  }
  return report;
}

async function cloudflareRequest<T>(
  token: string,
  path: string,
  init: RequestInit = {},
  allowNotFound = false,
): Promise<T | null> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });

  if (allowNotFound && response.status === 404) return null;

  const body = (await response.json()) as CloudflareEnvelope<T>;
  if (!response.ok || !body.success) {
    const details = [...(body.errors ?? []), ...(body.messages ?? [])]
      .map((item) => item.message ?? String(item.code ?? 'unknown error'))
      .join('; ');
    throw new Error(
      `Cloudflare API ${init.method ?? 'GET'} ${path} failed (${response.status})${details ? `: ${details}` : ''}`,
    );
  }
  return body.result;
}

async function resolveZoneId(token: string, zoneName: string): Promise<string> {
  const result = await cloudflareRequest<Array<{ id: string; name: string }>>(
    token,
    `/zones?name=${encodeURIComponent(zoneName)}&status=active&match=all`,
  );
  const zone = result?.find((item) => item.name === zoneName);
  if (!zone) throw new Error(`Active Cloudflare zone not found: ${zoneName}`);
  return zone.id;
}

async function getRateLimitRuleset(
  token: string,
  zoneId: string,
): Promise<CloudflareRuleset | null> {
  return cloudflareRequest<CloudflareRuleset>(
    token,
    `/zones/${zoneId}/rulesets/phases/${PHASE}/entrypoint`,
    {},
    true,
  );
}

function findManagedRule(
  ruleset: CloudflareRuleset | null,
): CloudflareRule | undefined {
  return findRuleByRef(ruleset, TILE_RATE_LIMIT_RULE_REF);
}

async function upsertManagedRule(
  token: string,
  zoneId: string,
  rule: CloudflareRateLimitRule,
): Promise<CloudflareRule> {
  const ruleset = await getRateLimitRuleset(token, zoneId);
  const existing = findManagedRule(ruleset);

  if (ruleset && existing?.id) {
    const updatedRuleset = await cloudflareRequest<CloudflareRuleset>(
      token,
      `/zones/${zoneId}/rulesets/${ruleset.id}/rules/${existing.id}`,
      { method: 'PATCH', body: JSON.stringify(rule) },
    );
    const updated = findManagedRule(updatedRuleset);
    if (!updated)
      throw new Error('Cloudflare returned no updated managed rule');
    return updated;
  }

  if (ruleset) {
    const updatedRuleset = await cloudflareRequest<CloudflareRuleset>(
      token,
      `/zones/${zoneId}/rulesets/${ruleset.id}/rules`,
      { method: 'POST', body: JSON.stringify(rule) },
    );
    const created = findManagedRule(updatedRuleset);
    if (!created)
      throw new Error('Cloudflare returned no created managed rule');
    return created;
  }

  const createdRuleset = await cloudflareRequest<CloudflareRuleset>(
    token,
    `/zones/${zoneId}/rulesets/phases/${PHASE}/entrypoint`,
    {
      method: 'PUT',
      body: JSON.stringify({
        description: 'CoMapeo zone rate limiting',
        rules: [rule],
      }),
    },
  );
  const created = findManagedRule(createdRuleset);
  if (!created)
    throw new Error('Cloudflare created the ruleset but not the managed rule');
  return created;
}

function writableExistingRule(rule: CloudflareRule): CloudflareRule {
  const {
    action,
    action_parameters,
    description,
    enabled,
    expression,
    ratelimit,
    ref,
  } = rule;
  return {
    action,
    ...(action_parameters ? { action_parameters } : {}),
    description,
    enabled,
    expression,
    ratelimit,
    ref,
  };
}

async function disableManagedRule(
  token: string,
  zoneId: string,
): Promise<boolean> {
  const ruleset = await getRateLimitRuleset(token, zoneId);
  const existing = findManagedRule(ruleset);
  if (!ruleset || !existing?.id) return false;
  const body = writableExistingRule(existing);
  body.enabled = false;
  await cloudflareRequest(
    token,
    `/zones/${zoneId}/rulesets/${ruleset.id}/rules/${existing.id}`,
    { method: 'PATCH', body: JSON.stringify(body) },
  );
  return true;
}

function reportRule(
  report: MeasurementReport,
  values: Map<string, string | boolean>,
): CloudflareRateLimitRule {
  validateProductionMeasurementTarget(report);
  const mode = modeOption(values);
  const threshold = numberOption(
    values,
    'threshold',
    report.recommendedRequestsPerPeriod,
  );
  const mitigationTimeoutSeconds = numberOption(
    values,
    'mitigation-timeout',
    report.windowSeconds,
  );

  if (mode === 'enforce') {
    validateEnforcementReadiness({
      report,
      host: PRODUCTION_TILE_HOST,
      requestsPerPeriod: threshold,
      periodSeconds: report.windowSeconds,
      falsePositiveValidationConfirmed: booleanOption(
        values,
        'confirm-false-positive-validation',
      ),
    });
  }

  return buildCloudflareRateLimitRule({
    host: PRODUCTION_TILE_HOST,
    requestsPerPeriod: threshold,
    periodSeconds: report.windowSeconds,
    mitigationTimeoutSeconds,
    mode,
  });
}

async function measure(values: Map<string, string | boolean>): Promise<void> {
  const host = stringOption(values, 'host', 'app.comapeo.cloud');
  const period = numberOption(values, 'period', 60);
  const safetyMultiplier = numberOption(values, 'safety', 1.5);
  const smallPath = stringOption(values, 'small');
  const largePath = stringOption(values, 'large');
  const outputPath = stringOption(values, 'output');

  const [smallHar, largeHar] = await Promise.all([
    readJson(smallPath),
    readJson(largePath),
  ]);
  const samples = [
    summarizeHarSample(smallHar as Parameters<typeof summarizeHarSample>[0], {
      kind: 'small',
      name: smallPath,
      host,
      windowSeconds: period,
    }),
    summarizeHarSample(largeHar as Parameters<typeof summarizeHarSample>[0], {
      kind: 'large',
      name: largePath,
      host,
      windowSeconds: period,
    }),
  ];
  const report = buildMeasurementReport({
    host,
    windowSeconds: period,
    samples,
    safetyMultiplier,
  });
  await writeFile(resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

async function render(values: Map<string, string | boolean>): Promise<void> {
  const report = await readReport(stringOption(values, 'report'));
  console.log(JSON.stringify(reportRule(report, values), null, 2));
}

function tokenFromEnv(): string {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error('CLOUDFLARE_API_TOKEN is required');
  return token;
}

async function apply(values: Map<string, string | boolean>): Promise<void> {
  const token = tokenFromEnv();
  const report = await readReport(stringOption(values, 'report'));
  const zoneName = productionZoneOption(values);
  const zoneId = await resolveZoneId(token, zoneName);
  const rule = reportRule(report, values);
  const result = await upsertManagedRule(token, zoneId, rule);
  console.log(
    JSON.stringify(
      {
        zone: zoneName,
        ruleId: result.id,
        ref: result.ref,
        action: result.action,
        enabled: result.enabled,
        expression: result.expression,
        ratelimit: result.ratelimit,
      },
      null,
      2,
    ),
  );
}

async function status(values: Map<string, string | boolean>): Promise<void> {
  const token = tokenFromEnv();
  const zoneName = productionZoneOption(values);
  const zoneId = await resolveZoneId(token, zoneName);
  const ruleset = await getRateLimitRuleset(token, zoneId);
  const rule = findManagedRule(ruleset);
  console.log(
    JSON.stringify(
      rule
        ? {
            zone: zoneName,
            rulesetId: ruleset?.id,
            ruleId: rule.id,
            ref: rule.ref,
            action: rule.action,
            enabled: rule.enabled,
            expression: rule.expression,
            ratelimit: rule.ratelimit,
          }
        : { zone: zoneName, present: false },
      null,
      2,
    ),
  );
}

async function disable(values: Map<string, string | boolean>): Promise<void> {
  const token = tokenFromEnv();
  const zoneName = productionZoneOption(values);
  const zoneId = await resolveZoneId(token, zoneName);
  const changed = await disableManagedRule(token, zoneId);
  console.log(
    JSON.stringify(
      { zone: zoneName, ref: TILE_RATE_LIMIT_RULE_REF, disabled: changed },
      null,
      2,
    ),
  );
}

async function main(): Promise<void> {
  const { command, values } = parseArgs(process.argv.slice(2));
  if (command === 'measure') return measure(values);
  if (command === 'render') return render(values);
  if (command === 'apply') return apply(values);
  if (command === 'status') return status(values);
  if (command === 'disable') return disable(values);
  return usage();
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`tile-rate-limit: ${message}`);
  process.exitCode = 1;
});
