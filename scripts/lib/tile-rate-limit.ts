export const TILE_RATE_LIMIT_PATH = '/api/tiles';
export const TILE_RATE_LIMIT_METHOD = 'GET';
export const TILE_RATE_LIMIT_RULE_REF = 'comapeo-cloud-app-tiles-rate-limit';
export const PRODUCTION_TILE_HOST = 'app.comapeo.cloud';
export const PRODUCTION_ZONE_NAME = 'comapeo.cloud';

const SUPPORTED_PERIODS = new Set([10, 60, 120, 300, 600, 3600]);
const SUPPORTED_MITIGATION_TIMEOUTS = new Set([
  0, 10, 60, 120, 300, 600, 3600, 86400,
]);

export type SampleKind = 'small' | 'large';
export type RateLimitMode = 'observe' | 'enforce';

interface HarEntry {
  startedDateTime?: unknown;
  request?: {
    method?: unknown;
    url?: unknown;
  };
}

interface HarLike {
  log?: {
    entries?: unknown;
  };
}

export interface MeasurementSample {
  kind: SampleKind;
  name: string;
  requestCount: number;
  durationMs: number;
  maxRequestsPerWindow: number;
  firstRequestAt: string;
  lastRequestAt: string;
}

export interface MeasurementReport {
  schemaVersion: 1;
  target: {
    host: string;
    method: typeof TILE_RATE_LIMIT_METHOD;
    path: typeof TILE_RATE_LIMIT_PATH;
  };
  measuredAt: string;
  windowSeconds: number;
  safetyMultiplier: number;
  observedMaxRequestsPerWindow: number;
  recommendedRequestsPerPeriod: number;
  samples: MeasurementSample[];
}

export function findRulesByRef<T extends { ref?: string }>(
  ruleset: { rules?: T[] } | null,
  ref = TILE_RATE_LIMIT_RULE_REF,
): T[] {
  return ruleset?.rules?.filter((rule) => rule.ref === ref) ?? [];
}

export function findRuleByRef<T extends { ref?: string }>(
  ruleset: { rules?: T[] } | null,
  ref = TILE_RATE_LIMIT_RULE_REF,
): T | undefined {
  return findRulesByRef(ruleset, ref)[0];
}

export interface CloudflareRateLimitRule {
  ref: string;
  description: string;
  expression: string;
  action: 'log' | 'block';
  enabled: boolean;
  action_parameters?: {
    response: {
      status_code: 429;
      content_type: 'text/plain';
      content: string;
    };
  };
  ratelimit: {
    characteristics: ['cf.colo.id', 'ip.src'];
    period: number;
    requests_per_period: number;
    mitigation_timeout: number;
    requests_to_origin: false;
  };
}

function assertHost(host: string): void {
  if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(host)) {
    throw new Error(`Invalid hostname: ${host}`);
  }
}

export function validateProductionZoneName(zoneName: string): void {
  if (zoneName !== PRODUCTION_ZONE_NAME) {
    throw new Error(
      `Cloudflare operations must target the production zone ${PRODUCTION_ZONE_NAME}`,
    );
  }
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
}

function roundUpToTen(value: number): number {
  return Math.ceil(value / 10) * 10;
}

export function maxRequestsInWindow(
  timestamps: readonly number[],
  windowMs: number,
): number {
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new Error('windowMs must be greater than zero');
  }
  if (timestamps.length === 0) return 0;

  const ordered = [...timestamps].sort((a, b) => a - b);
  let left = 0;
  let max = 0;

  for (let right = 0; right < ordered.length; right += 1) {
    const rightTimestamp = ordered[right];
    if (rightTimestamp === undefined || !Number.isFinite(rightTimestamp)) {
      throw new Error('timestamps must contain finite numbers');
    }

    while (
      left <= right &&
      ordered[left] !== undefined &&
      rightTimestamp - ordered[left]! >= windowMs
    ) {
      left += 1;
    }
    max = Math.max(max, right - left + 1);
  }

  return max;
}

export function summarizeHarSample(
  har: HarLike,
  options: {
    kind: SampleKind;
    name: string;
    host: string;
    windowSeconds: number;
  },
): MeasurementSample {
  assertHost(options.host);
  assertPositiveInteger(options.windowSeconds, 'windowSeconds');

  if (!har.log || !Array.isArray(har.log.entries)) {
    throw new Error('Invalid HAR: expected log.entries array');
  }

  const timestamps: number[] = [];
  for (const candidate of har.log.entries) {
    if (!candidate || typeof candidate !== 'object') continue;
    const entry = candidate as HarEntry;
    if (!entry.request || entry.request.method !== TILE_RATE_LIMIT_METHOD)
      continue;
    if (typeof entry.request.url !== 'string') continue;
    if (typeof entry.startedDateTime !== 'string') continue;

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(entry.request.url);
    } catch {
      continue;
    }
    if (
      parsedUrl.hostname !== options.host ||
      parsedUrl.pathname !== TILE_RATE_LIMIT_PATH
    ) {
      continue;
    }

    const timestamp = Date.parse(entry.startedDateTime);
    if (!Number.isNaN(timestamp)) timestamps.push(timestamp);
  }

  if (timestamps.length === 0) {
    throw new Error(
      `HAR sample ${options.name} contains no ${TILE_RATE_LIMIT_METHOD} https://${options.host}${TILE_RATE_LIMIT_PATH} requests`,
    );
  }

  timestamps.sort((a, b) => a - b);
  const first = timestamps[0]!;
  const last = timestamps[timestamps.length - 1]!;
  return {
    kind: options.kind,
    name: options.name,
    requestCount: timestamps.length,
    durationMs: Math.max(0, last - first),
    maxRequestsPerWindow: maxRequestsInWindow(
      timestamps,
      options.windowSeconds * 1000,
    ),
    firstRequestAt: new Date(first).toISOString(),
    lastRequestAt: new Date(last).toISOString(),
  };
}

export function buildMeasurementReport(options: {
  host: string;
  windowSeconds: number;
  samples: MeasurementSample[];
  measuredAt?: string;
  safetyMultiplier?: number;
}): MeasurementReport {
  assertHost(options.host);
  if (!SUPPORTED_PERIODS.has(options.windowSeconds)) {
    throw new Error(
      `windowSeconds must be a Cloudflare-supported period: ${[...SUPPORTED_PERIODS].join(', ')}`,
    );
  }

  const kinds = new Set(options.samples.map((sample) => sample.kind));
  if (!kinds.has('small') || !kinds.has('large')) {
    throw new Error(
      'Measurement report requires both small and large representative SMP download samples',
    );
  }

  for (const sample of options.samples) {
    assertPositiveInteger(sample.requestCount, `${sample.name} requestCount`);
    assertPositiveInteger(
      sample.maxRequestsPerWindow,
      `${sample.name} maxRequestsPerWindow`,
    );
  }

  const safetyMultiplier = options.safetyMultiplier ?? 1.5;
  if (!Number.isFinite(safetyMultiplier) || safetyMultiplier <= 1) {
    throw new Error('safetyMultiplier must be greater than 1');
  }

  const observedMaxRequestsPerWindow = Math.max(
    ...options.samples.map((sample) => sample.maxRequestsPerWindow),
  );
  const recommendedRequestsPerPeriod = roundUpToTen(
    observedMaxRequestsPerWindow * safetyMultiplier,
  );

  const measuredAt = options.measuredAt ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(measuredAt))) {
    throw new Error('measuredAt must be a valid ISO date');
  }

  return {
    schemaVersion: 1,
    target: {
      host: options.host,
      method: TILE_RATE_LIMIT_METHOD,
      path: TILE_RATE_LIMIT_PATH,
    },
    measuredAt,
    windowSeconds: options.windowSeconds,
    safetyMultiplier,
    observedMaxRequestsPerWindow,
    recommendedRequestsPerPeriod,
    samples: options.samples,
  };
}

export function buildCloudflareRateLimitRule(options: {
  host: string;
  requestsPerPeriod: number;
  periodSeconds: number;
  mitigationTimeoutSeconds: number;
  mode: RateLimitMode;
}): CloudflareRateLimitRule {
  assertHost(options.host);
  assertPositiveInteger(options.requestsPerPeriod, 'requestsPerPeriod');
  if (!SUPPORTED_PERIODS.has(options.periodSeconds)) {
    throw new Error(
      `periodSeconds must be one of: ${[...SUPPORTED_PERIODS].join(', ')}`,
    );
  }
  if (!SUPPORTED_MITIGATION_TIMEOUTS.has(options.mitigationTimeoutSeconds)) {
    throw new Error(
      `mitigationTimeoutSeconds must be one of: ${[...SUPPORTED_MITIGATION_TIMEOUTS].join(', ')}`,
    );
  }

  const base: CloudflareRateLimitRule = {
    ref: TILE_RATE_LIMIT_RULE_REF,
    description: 'CoMapeo production tile proxy distributed abuse protection',
    expression: `(http.host eq "${options.host}" and http.request.method eq "${TILE_RATE_LIMIT_METHOD}" and http.request.uri.path eq "${TILE_RATE_LIMIT_PATH}")`,
    action: options.mode === 'observe' ? 'log' : 'block',
    enabled: true,
    ratelimit: {
      characteristics: ['cf.colo.id', 'ip.src'],
      period: options.periodSeconds,
      requests_per_period: options.requestsPerPeriod,
      mitigation_timeout: options.mitigationTimeoutSeconds,
      requests_to_origin: false,
    },
  };

  if (options.mode === 'enforce') {
    base.action_parameters = {
      response: {
        status_code: 429,
        content_type: 'text/plain',
        content:
          'Tile download rate limit exceeded. Retry after a short delay.',
      },
    };
  }

  return base;
}

export function validateProductionMeasurementTarget(
  report: MeasurementReport,
): void {
  if (
    report.target.host !== PRODUCTION_TILE_HOST ||
    report.target.method !== TILE_RATE_LIMIT_METHOD ||
    report.target.path !== TILE_RATE_LIMIT_PATH
  ) {
    throw new Error(
      'Measurement report must target production GET https://app.comapeo.cloud/api/tiles',
    );
  }
}

function validateReportSamples(report: MeasurementReport): number {
  if (!Array.isArray(report.samples)) {
    throw new Error('Measurement report samples must be an array');
  }

  const kinds = new Set<SampleKind>();
  let observedMaxRequestsPerWindow = 0;

  for (const sample of report.samples) {
    if (!sample || typeof sample !== 'object') {
      throw new Error('Measurement report contains an invalid sample');
    }
    if (sample.kind !== 'small' && sample.kind !== 'large') {
      throw new Error(
        `Measurement report contains invalid sample kind: ${String(sample.kind)}`,
      );
    }
    if (typeof sample.name !== 'string' || sample.name.length === 0) {
      throw new Error('Measurement report sample name must be non-empty');
    }
    assertPositiveInteger(sample.requestCount, `${sample.name} requestCount`);
    assertPositiveInteger(
      sample.maxRequestsPerWindow,
      `${sample.name} maxRequestsPerWindow`,
    );
    if (sample.maxRequestsPerWindow > sample.requestCount) {
      throw new Error(
        `Measurement report sample ${sample.name} has a burst larger than its request count`,
      );
    }
    if (!Number.isSafeInteger(sample.durationMs) || sample.durationMs < 0) {
      throw new Error(
        `Measurement report sample ${sample.name} durationMs must be a non-negative integer`,
      );
    }

    const firstRequestAt = Date.parse(sample.firstRequestAt);
    const lastRequestAt = Date.parse(sample.lastRequestAt);
    if (
      Number.isNaN(firstRequestAt) ||
      Number.isNaN(lastRequestAt) ||
      lastRequestAt < firstRequestAt ||
      sample.durationMs !== lastRequestAt - firstRequestAt
    ) {
      throw new Error(
        `Measurement report sample ${sample.name} has inconsistent request timestamps`,
      );
    }

    kinds.add(sample.kind);
    observedMaxRequestsPerWindow = Math.max(
      observedMaxRequestsPerWindow,
      sample.maxRequestsPerWindow,
    );
  }

  if (!kinds.has('small') || !kinds.has('large')) {
    throw new Error('Measurement report must contain small and large samples');
  }
  assertPositiveInteger(
    report.observedMaxRequestsPerWindow,
    'observedMaxRequestsPerWindow',
  );
  if (report.observedMaxRequestsPerWindow !== observedMaxRequestsPerWindow) {
    throw new Error(
      `Measurement report observed burst is inconsistent with samples: stored ${report.observedMaxRequestsPerWindow}, recomputed ${observedMaxRequestsPerWindow}`,
    );
  }

  return observedMaxRequestsPerWindow;
}

export function validateEnforcementReadiness(options: {
  report: MeasurementReport;
  host: string;
  requestsPerPeriod: number;
  periodSeconds: number;
  falsePositiveValidationConfirmed: boolean;
}): void {
  assertHost(options.host);
  assertPositiveInteger(options.requestsPerPeriod, 'requestsPerPeriod');

  if (options.report.schemaVersion !== 1) {
    throw new Error('Unsupported measurement report schema version');
  }
  if (
    options.report.target.host !== options.host ||
    options.report.target.method !== TILE_RATE_LIMIT_METHOD ||
    options.report.target.path !== TILE_RATE_LIMIT_PATH
  ) {
    throw new Error(
      'Measurement report target does not match the enforcement target',
    );
  }
  if (options.report.windowSeconds !== options.periodSeconds) {
    throw new Error(
      'Measurement report window must match the Cloudflare rate-limit period',
    );
  }

  const observedMaxRequestsPerWindow = validateReportSamples(options.report);
  if (options.requestsPerPeriod <= observedMaxRequestsPerWindow) {
    throw new Error(
      `Configured threshold (${options.requestsPerPeriod}) must exceed the observed legitimate burst (${observedMaxRequestsPerWindow})`,
    );
  }
  if (!options.falsePositiveValidationConfirmed) {
    throw new Error(
      'Enforcement requires explicit confirmation that false-positive validation was completed in non-blocking mode',
    );
  }
}
