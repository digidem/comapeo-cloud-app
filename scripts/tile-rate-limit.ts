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
  findRulesByRef,
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

const COMMAND_OPTIONS: Record<string, ReadonlySet<string>> = {
  measure: new Set(['small', 'large', 'output', 'host', 'period', 'safety']),
  render: new Set([
    'report',
    'mode',
    'threshold',
    'mitigation-timeout',
    'confirm-false-positive-validation',
  ]),
  apply: new Set([
    'report',
    'mode',
    'threshold',
    'mitigation-timeout',
    'zone',
    'confirm-false-positive-validation',
  ]),
  status: new Set(['zone']),
  disable: new Set(['zone']),
};

const BOOLEAN_OPTIONS = new Set(['confirm-false-positive-validation']);

function usage(): never {
  console.error(`Usage:
  npm run ops:tile-rate-limit -- measure --small <small.har> --large <large.har> --output <report.json> [--host app.comapeo.cloud] [--period 60] [--safety 1.5]
  npm run ops:tile-rate-limit -- render --report <report.json> [--mode observe|enforce] [--threshold N] [--mitigation-timeout SECONDS] [--confirm-false-positive-validation]
  npm run ops:tile-rate-limit -- apply --report <report.json> [--mode observe|enforce] [--threshold N] [--mitigation-timeout SECONDS] [--zone comapeo.cloud] [--confirm-false-positive-validation]
  npm run ops:tile-rate-limit -- status [--zone comapeo.cloud]
  npm run ops:tile-rate-limit -- disable [--zone comapeo.cloud]

Cloudflare apply/status/disable require CLOUDFLARE_API_TOKEN. Enforcement also
requires a measurement report with both small and large SMP samples plus the
explicit --confirm-false-positive-validation flag.`);
  process.exit(2);
}

export function parseArgs(argv: string[]): CliOptions {
  const [command, ...rest] = argv;
  if (!command) return usage();
  const allowedOptions = COMMAND_OPTIONS[command];
  if (!allowedOptions) return usage();
  const values = new Map<string, string | boolean>();
  for (let index = 0; index < rest.length; index += 1) {
    const current = rest[index];
    if (!current?.startsWith('--')) {
      throw new Error(`Unexpected argument: ${String(current)}`);
    }
    if (current.includes('=')) {
      throw new Error(
        'Options must use --key value syntax; --key=value is not supported',
      );
    }
    const key = current.slice(2);
    if (!allowedOptions.has(key)) {
      throw new Error(`Unknown option --${key} for ${command}`);
    }
    if (values.has(key)) {
      throw new Error(`Duplicate option --${key}`);
    }
    const next = rest[index + 1];
    if (BOOLEAN_OPTIONS.has(key)) {
      if (next && !next.startsWith('--')) {
        throw new Error(`--${key} does not take a value`);
      }
      values.set(key, true);
      continue;
    }
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

export function findManagedRules(
  ruleset: CloudflareRuleset | null,
): CloudflareRule[] {
  return findRulesByRef(ruleset, TILE_RATE_LIMIT_RULE_REF);
}

function requireAtMostOneManagedRule(
  ruleset: CloudflareRuleset | null,
  operation: string,
): CloudflareRule | undefined {
  const matches = findManagedRules(ruleset);
  if (matches.length > 1) {
    throw new Error(
      `Found ${matches.length} managed tile rate-limit rules during ${operation}; resolve duplicate managed rules before continuing`,
    );
  }
  return matches[0];
}

export function assertManagedRuleMatchesIntent(
  actual: CloudflareRule,
  expected: CloudflareRateLimitRule,
  operation: string,
): void {
  const mismatches: string[] = [];

  if (actual.action !== expected.action) mismatches.push('action');
  if (actual.enabled !== expected.enabled) mismatches.push('enabled');
  if (actual.expression !== expected.expression) mismatches.push('expression');

  const actualRateLimit = actual.ratelimit;
  if (!actualRateLimit) {
    mismatches.push('ratelimit');
  } else {
    if (actualRateLimit.period !== expected.ratelimit.period) {
      mismatches.push('ratelimit.period');
    }
    if (
      actualRateLimit.requests_per_period !==
      expected.ratelimit.requests_per_period
    ) {
      mismatches.push('ratelimit.requests_per_period');
    }
    if (
      actualRateLimit.mitigation_timeout !==
      expected.ratelimit.mitigation_timeout
    ) {
      mismatches.push('ratelimit.mitigation_timeout');
    }
    if (
      actualRateLimit.requests_to_origin !==
      expected.ratelimit.requests_to_origin
    ) {
      mismatches.push('ratelimit.requests_to_origin');
    }
    const actualCharacteristics = new Set(actualRateLimit.characteristics);
    if (
      actualCharacteristics.size !==
        expected.ratelimit.characteristics.length ||
      expected.ratelimit.characteristics.some(
        (characteristic) => !actualCharacteristics.has(characteristic),
      )
    ) {
      mismatches.push('ratelimit.characteristics');
    }
  }

  if (expected.action_parameters === undefined) {
    if (actual.action_parameters !== undefined) {
      mismatches.push('action_parameters');
    }
  } else {
    const actualResponse = actual.action_parameters?.response;
    const expectedResponse = expected.action_parameters.response;
    if (
      !actualResponse ||
      actualResponse.status_code !== expectedResponse.status_code ||
      actualResponse.content_type !== expectedResponse.content_type ||
      actualResponse.content !== expectedResponse.content
    ) {
      mismatches.push('action_parameters');
    }
  }

  if (mismatches.length > 0) {
    throw new Error(
      `Cloudflare ${operation} response does not match the requested managed rule (${mismatches.join(', ')}). Run status and disable before retrying`,
    );
  }
}

export async function upsertManagedRule(
  token: string,
  zoneId: string,
  rule: CloudflareRateLimitRule,
): Promise<CloudflareRule> {
  const ruleset = await getRateLimitRuleset(token, zoneId);
  const existing = requireAtMostOneManagedRule(ruleset, 'upsert');

  if (ruleset && existing?.id) {
    const updatedRuleset = await cloudflareRequest<CloudflareRuleset>(
      token,
      `/zones/${zoneId}/rulesets/${ruleset.id}/rules/${existing.id}`,
      { method: 'PATCH', body: JSON.stringify(rule) },
    );
    const updated = requireAtMostOneManagedRule(
      updatedRuleset,
      'update response',
    );
    if (!updated)
      throw new Error('Cloudflare returned no updated managed rule');
    assertManagedRuleMatchesIntent(updated, rule, 'update');
    return updated;
  }

  if (ruleset) {
    const updatedRuleset = await cloudflareRequest<CloudflareRuleset>(
      token,
      `/zones/${zoneId}/rulesets/${ruleset.id}/rules`,
      { method: 'POST', body: JSON.stringify(rule) },
    );
    const created = requireAtMostOneManagedRule(
      updatedRuleset,
      'create response',
    );
    if (!created)
      throw new Error('Cloudflare returned no created managed rule');
    assertManagedRuleMatchesIntent(created, rule, 'create');
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
  const created = requireAtMostOneManagedRule(
    createdRuleset,
    'ruleset creation response',
  );
  if (!created)
    throw new Error('Cloudflare created the ruleset but not the managed rule');
  assertManagedRuleMatchesIntent(created, rule, 'ruleset creation');
  return created;
}

export function writableExistingRule(
  rule: CloudflareRule,
): Record<string, unknown> {
  const writable = { ...rule } as Record<string, unknown>;
  delete writable.id;
  delete writable.version;
  delete writable.last_updated;
  return writable;
}

export async function disableManagedRule(
  token: string,
  zoneId: string,
): Promise<boolean> {
  const ruleset = await getRateLimitRuleset(token, zoneId);
  const existingRules = findManagedRules(ruleset);
  if (!ruleset || existingRules.length === 0) return false;
  if (existingRules.some((rule) => !rule.id)) {
    throw new Error('Cloudflare returned a managed rule without an id');
  }

  for (const existing of existingRules) {
    const body = writableExistingRule(existing);
    body.enabled = false;
    const updatedRuleset = await cloudflareRequest<CloudflareRuleset>(
      token,
      `/zones/${zoneId}/rulesets/${ruleset.id}/rules/${existing.id}`,
      { method: 'PATCH', body: JSON.stringify(body) },
    );
    const updated = updatedRuleset?.rules?.find(
      (rule) => rule.id === existing.id,
    );
    if (!updated || updated.enabled !== false) {
      throw new Error(
        `Cloudflare did not confirm managed rule ${existing.id} was disabled`,
      );
    }
  }
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
  const rules = findManagedRules(ruleset);
  const rule = rules[0];
  console.log(
    JSON.stringify(
      rule
        ? {
            zone: zoneName,
            rulesetId: ruleset?.id,
            managedRuleCount: rules.length,
            duplicateManagedRules: rules.length > 1,
            ruleId: rule.id,
            ref: rule.ref,
            action: rule.action,
            enabled: rule.enabled,
            expression: rule.expression,
            ratelimit: rule.ratelimit,
          }
        : { zone: zoneName, present: false, managedRuleCount: 0 },
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

export async function main(): Promise<void> {
  const { command, values } = parseArgs(process.argv.slice(2));
  if (command === 'measure') return measure(values);
  if (command === 'render') return render(values);
  if (command === 'apply') return apply(values);
  if (command === 'status') return status(values);
  if (command === 'disable') return disable(values);
  return usage();
}

if (process.argv[1]?.endsWith('tile-rate-limit.ts')) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`tile-rate-limit: ${message}`);
    process.exitCode = 1;
  });
}
