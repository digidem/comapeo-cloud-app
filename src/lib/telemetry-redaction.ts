export const TELEMETRY_REDACTED = '[REDACTED]' as const;
export const TELEMETRY_TRUNCATED = '[TRUNCATED]' as const;
export const TELEMETRY_CIRCULAR = '[Circular]' as const;

export const MAX_SANITIZE_DEPTH = 8;
export const MAX_SANITIZE_ENTRIES = 100;
export const MAX_SANITIZE_STRING_LENGTH = 8192;

export const SECRET_TELEMETRY_KEYS = new Set([
  'authorization',
  'proxy-authorization',
  'token',
  'accesstoken',
  'authtoken',
  'refreshtoken',
  'bearer',
  'password',
  'secret',
  'invitecode',
  'credential',
  'credentials',
  'apikey',
  'cookie',
  'cookies',
]);

export const GEOSPATIAL_TELEMETRY_KEYS = new Set([
  'lat',
  'lon',
  'lng',
  'latitude',
  'longitude',
  'coordinate',
  'coordinates',
  'geometry',
  'bbox',
  'bounds',
]);

export const SENSITIVE_DOMAIN_TELEMETRY_KEYS = new Set([
  'tags',
  'metadata',
  'observation',
  'observations',
  'alert',
  'alerts',
  'track',
  'tracks',
  'attachment',
  'attachments',
  'geojson',
  'feature',
  'features',
  'project',
  'projects',
  'projectid',
  'projectname',
  'projectrecord',
]);

function normalizeKey(key: string): string {
  return key.replace(/[-_\s]/g, '').toLowerCase();
}

export function isSensitiveTelemetryKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return (
    SECRET_TELEMETRY_KEYS.has(normalized) ||
    GEOSPATIAL_TELEMETRY_KEYS.has(normalized) ||
    SENSITIVE_DOMAIN_TELEMETRY_KEYS.has(normalized)
  );
}

function stripUrlSecrets(urlLike: string): string {
  try {
    const url = new URL(urlLike);
    return `${url.origin}${url.pathname}`;
  } catch {
    const queryIndex = urlLike.indexOf('?');
    const hashIndex = urlLike.indexOf('#');
    const firstSensitiveIndex = [queryIndex, hashIndex]
      .filter((index) => index >= 0)
      .sort((left, right) => left - right)[0];
    return firstSensitiveIndex === undefined
      ? urlLike
      : urlLike.slice(0, firstSensitiveIndex);
  }
}

function sanitizeUrlsInString(value: string): string {
  let sanitized = value.replace(/https?:\/\/[^\s"'<>]+/gi, (match) =>
    stripUrlSecrets(match),
  );

  sanitized = sanitized.replace(
    /(^|[\s("'])((?:\/[^\s"'<>?#]*)[?#][^\s"'<>]*)/g,
    (_match, prefix: string, route: string) =>
      `${prefix}${stripUrlSecrets(route)}`,
  );

  return sanitized;
}

export function sanitizeTelemetryString(
  value: string,
  sensitiveValues: ReadonlySet<string> = new Set<string>(),
): string {
  let sanitized = sanitizeUrlsInString(value)
    .replace(/Bearer\s+[^\s,;]+/gi, `Bearer ${TELEMETRY_REDACTED}`)
    .replace(
      /\b(?:token|access[_-]?token|auth[_-]?token|secret|credential|invite[_-]?code|authorization)(?:=|:|\s)+[^\s,;#]+/gi,
      (match) => {
        const separatorIndex = match.search(/[=:\s]/);
        const prefix =
          separatorIndex >= 0 ? match.slice(0, separatorIndex) : 'value';
        return `${prefix}=${TELEMETRY_REDACTED}`;
      },
    );

  for (const sensitiveValue of [...sensitiveValues].sort(
    (left, right) => right.length - left.length,
  )) {
    if (sensitiveValue.length === 0) continue;
    sanitized = sanitized.split(sensitiveValue).join(TELEMETRY_REDACTED);
  }

  if (sanitized.length > MAX_SANITIZE_STRING_LENGTH) {
    sanitized = `${sanitized.slice(0, MAX_SANITIZE_STRING_LENGTH)}${TELEMETRY_TRUNCATED}`;
  }

  return sanitized;
}

function collectSensitiveValues(
  value: unknown,
  depth: number,
  forceSensitive: boolean,
  seen: WeakSet<object>,
  output: Set<string>,
): void {
  if (depth > MAX_SANITIZE_DEPTH || output.size >= MAX_SANITIZE_ENTRIES) return;
  if (value === null || value === undefined) return;

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'bigint'
  ) {
    if (forceSensitive) output.add(String(value));
    return;
  }

  if (typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value.slice(0, MAX_SANITIZE_ENTRIES)) {
      collectSensitiveValues(item, depth + 1, forceSensitive, seen, output);
    }
    return;
  }

  for (const [key, entryValue] of Object.entries(
    value as Record<string, unknown>,
  ).slice(0, MAX_SANITIZE_ENTRIES)) {
    collectSensitiveValues(
      entryValue,
      depth + 1,
      forceSensitive || isSensitiveTelemetryKey(key),
      seen,
      output,
    );
  }
}

function sanitizeValue(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
  sensitiveValues: ReadonlySet<string>,
): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return sanitizeTelemetryString(value, sensitiveValues);
  }
  if (typeof value === 'number') {
    return sensitiveValues.has(String(value)) ? TELEMETRY_REDACTED : value;
  }
  if (typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'function' || typeof value === 'symbol') {
    return TELEMETRY_REDACTED;
  }
  if (depth >= MAX_SANITIZE_DEPTH) return TELEMETRY_TRUNCATED;
  if (typeof value !== 'object') return TELEMETRY_REDACTED;

  if (seen.has(value)) return TELEMETRY_CIRCULAR;
  seen.add(value);

  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      name: sanitizeTelemetryString(value.name, sensitiveValues),
      message: sanitizeTelemetryString(value.message, sensitiveValues),
    };
  }

  if (Array.isArray(value)) {
    const result = value
      .slice(0, MAX_SANITIZE_ENTRIES)
      .map((item) => sanitizeValue(item, depth + 1, seen, sensitiveValues));
    if (value.length > MAX_SANITIZE_ENTRIES) {
      result.push(TELEMETRY_TRUNCATED);
    }
    return result;
  }

  const source = value as Record<string, unknown>;
  const entries = Object.entries(source)
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, MAX_SANITIZE_ENTRIES);
  const result: Record<string, unknown> = {};

  for (const [key, entryValue] of entries) {
    result[key] = isSensitiveTelemetryKey(key)
      ? TELEMETRY_REDACTED
      : sanitizeValue(entryValue, depth + 1, seen, sensitiveValues);
  }

  if (Object.keys(source).length > MAX_SANITIZE_ENTRIES) {
    result.__truncated__ = TELEMETRY_TRUNCATED;
  }

  return result;
}

export function sanitizeTelemetry<T>(value: T): T {
  const sensitiveValues = new Set<string>();
  collectSensitiveValues(
    value,
    0,
    false,
    new WeakSet<object>(),
    sensitiveValues,
  );
  return sanitizeValue(value, 0, new WeakSet<object>(), sensitiveValues) as T;
}
