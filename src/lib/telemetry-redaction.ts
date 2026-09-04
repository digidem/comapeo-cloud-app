export const TELEMETRY_REDACTED = '[REDACTED]' as const;
export const TELEMETRY_TRUNCATED = '[TRUNCATED]' as const;
export const TELEMETRY_CIRCULAR = '[Circular]' as const;

export const MAX_SANITIZE_DEPTH = 8;
export const MAX_SANITIZE_ENTRIES = 100;
export const MAX_SANITIZE_STRING_LENGTH = 8192;
const MIN_PROPAGATED_SENSITIVE_VALUE_LENGTH = 8;
const MIN_PROPAGATED_NUMERIC_SENSITIVE_VALUE_LENGTH = 6;

export const SECRET_TELEMETRY_KEYS = new Set([
  'authorization',
  'proxyauthorization',
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
  'xapikey',
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

  sanitized = sanitized.replace(
    /(\/projects\/)[^/\s"'<>?#]+/gi,
    (_match, prefix: string) => prefix + TELEMETRY_REDACTED,
  );

  return sanitized;
}

function telemetryKeyPriority(key: string): number {
  const normalized = normalizeKey(key);
  if (SECRET_TELEMETRY_KEYS.has(normalized)) return 0;
  if (
    GEOSPATIAL_TELEMETRY_KEYS.has(normalized) ||
    SENSITIVE_DOMAIN_TELEMETRY_KEYS.has(normalized)
  ) {
    return 1;
  }
  return 2;
}

function selectBoundedObjectEntries(
  value: Record<string, unknown>,
): Array<[string, unknown]> {
  return Object.entries(value)
    .sort(([left], [right]) => {
      const sensitivityOrder =
        telemetryKeyPriority(left) - telemetryKeyPriority(right);
      return sensitivityOrder || left.localeCompare(right);
    })
    .slice(0, MAX_SANITIZE_ENTRIES);
}

interface SensitiveValueCollection {
  values: Set<string>;
  saturated: boolean;
}

function addSensitiveValue(
  collection: SensitiveValueCollection,
  candidate: string,
): void {
  if (collection.values.has(candidate)) return;
  if (collection.values.size >= MAX_SANITIZE_ENTRIES) {
    collection.saturated = true;
    return;
  }
  collection.values.add(candidate);
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
    if (/^[+-]?\d+(?:\.\d+)?$/.test(sensitiveValue)) {
      const escaped = sensitiveValue.replace(
        /[.*+?^${}()|[\]\\]/g,
        (character) => '\\' + character,
      );
      const boundaryPattern = new RegExp(
        `(^|[^\\d])${escaped}(?=$|[^\\d])`,
        'g',
      );
      sanitized = sanitized.replace(
        boundaryPattern,
        (_match, prefix: string) => `${prefix}${TELEMETRY_REDACTED}`,
      );
    } else {
      sanitized = sanitized.split(sensitiveValue).join(TELEMETRY_REDACTED);
    }
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
  collection: SensitiveValueCollection,
): void {
  if (depth > MAX_SANITIZE_DEPTH || collection.saturated) return;
  if (value === null || value === undefined) return;

  if (typeof value === 'string') {
    const candidate = value.trim();
    const isNumeric = /^[+-]?\d+(?:\.\d+)?$/.test(candidate);
    const minimumLength = isNumeric
      ? MIN_PROPAGATED_NUMERIC_SENSITIVE_VALUE_LENGTH
      : MIN_PROPAGATED_SENSITIVE_VALUE_LENGTH;
    if (forceSensitive && candidate.length >= minimumLength) {
      addSensitiveValue(collection, candidate);
    }
    return;
  }

  if (typeof value === 'number') {
    const candidate = String(value);
    const minimumLength = Number.isInteger(value)
      ? MIN_PROPAGATED_NUMERIC_SENSITIVE_VALUE_LENGTH
      : MIN_PROPAGATED_SENSITIVE_VALUE_LENGTH;
    if (
      forceSensitive &&
      Number.isFinite(value) &&
      candidate.length >= minimumLength
    ) {
      addSensitiveValue(collection, candidate);
    }
    return;
  }

  if (typeof value === 'bigint') return;

  if (typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value.slice(0, MAX_SANITIZE_ENTRIES)) {
      collectSensitiveValues(item, depth + 1, forceSensitive, seen, collection);
    }
    if (forceSensitive && value.length > MAX_SANITIZE_ENTRIES) {
      collection.saturated = true;
    }
    return;
  }

  const source = value as Record<string, unknown>;
  const entries = selectBoundedObjectEntries(source);
  for (const [key, entryValue] of entries) {
    collectSensitiveValues(
      entryValue,
      depth + 1,
      forceSensitive || isSensitiveTelemetryKey(key),
      seen,
      collection,
    );
  }
  if (forceSensitive && Object.keys(source).length > entries.length) {
    collection.saturated = true;
  }
}

function sanitizeTagMap(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return TELEMETRY_REDACTED;
  }

  const source = value as Record<string, unknown>;
  const entries = selectBoundedObjectEntries(source).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const result: Record<string, unknown> = {};

  for (const [key] of entries) {
    result[key] = TELEMETRY_REDACTED;
  }

  if (Object.keys(source).length > MAX_SANITIZE_ENTRIES) {
    result.__truncated__ = TELEMETRY_TRUNCATED;
  }

  return result;
}

function sanitizeValue(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
  sensitiveValues: ReadonlySet<string>,
  redactPrimitives: boolean,
  preserveRootTagKeys: boolean,
): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return redactPrimitives
      ? TELEMETRY_REDACTED
      : sanitizeTelemetryString(value, sensitiveValues);
  }
  if (typeof value === 'number') {
    if (redactPrimitives) return TELEMETRY_REDACTED;
    return sensitiveValues.has(String(value)) ? TELEMETRY_REDACTED : value;
  }
  if (typeof value === 'boolean') return value;
  if (typeof value === 'bigint') {
    return redactPrimitives ? TELEMETRY_REDACTED : String(value);
  }
  if (typeof value === 'function' || typeof value === 'symbol') {
    return TELEMETRY_REDACTED;
  }
  if (depth >= MAX_SANITIZE_DEPTH) return TELEMETRY_TRUNCATED;
  if (typeof value !== 'object') return TELEMETRY_REDACTED;

  if (seen.has(value)) return TELEMETRY_CIRCULAR;
  seen.add(value);

  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    if (redactPrimitives) {
      return { name: TELEMETRY_REDACTED, message: TELEMETRY_REDACTED };
    }
    return {
      name: sanitizeTelemetryString(value.name, sensitiveValues),
      message: sanitizeTelemetryString(value.message, sensitiveValues),
    };
  }

  if (Array.isArray(value)) {
    const result = value
      .slice(0, MAX_SANITIZE_ENTRIES)
      .map((item) =>
        sanitizeValue(
          item,
          depth + 1,
          seen,
          sensitiveValues,
          redactPrimitives,
          preserveRootTagKeys,
        ),
      );
    if (value.length > MAX_SANITIZE_ENTRIES) {
      result.push(TELEMETRY_TRUNCATED);
    }
    return result;
  }

  const source = value as Record<string, unknown>;
  const entries = selectBoundedObjectEntries(source).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const result: Record<string, unknown> = {};

  for (const [key, entryValue] of entries) {
    const normalizedKey = normalizeKey(key);
    if (normalizedKey === 'tags' && depth === 0 && preserveRootTagKeys) {
      result[key] = sanitizeTagMap(entryValue);
    } else if (isSensitiveTelemetryKey(key)) {
      result[key] = TELEMETRY_REDACTED;
    } else {
      result[key] = sanitizeValue(
        entryValue,
        depth + 1,
        seen,
        sensitiveValues,
        redactPrimitives,
        preserveRootTagKeys,
      );
    }
  }

  if (Object.keys(source).length > MAX_SANITIZE_ENTRIES) {
    result.__truncated__ = TELEMETRY_TRUNCATED;
  }

  return result;
}

export function sanitizeTelemetry<T>(
  value: T,
  options: { preserveRootTagKeys?: boolean } = {},
): T {
  const collection: SensitiveValueCollection = {
    values: new Set<string>(),
    saturated: false,
  };
  collectSensitiveValues(value, 0, false, new WeakSet<object>(), collection);
  return sanitizeValue(
    value,
    0,
    new WeakSet<object>(),
    collection.values,
    collection.saturated,
    options.preserveRootTagKeys ?? false,
  ) as T;
}
