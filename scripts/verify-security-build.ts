import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const distDir = path.join(root, 'dist');
const assetsDir = path.join(distDir, 'assets');

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[verify-security-build] ${message}`);
}

function normalizeSource(source: string): string {
  return source.replaceAll('\\', '/');
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf8')) as T;
}

interface SourceMap {
  sources?: string[];
  sourcesContent?: Array<string | null>;
}

const html = await readFile(path.join(distDir, 'index.html'), 'utf8');
const moduleScriptMatches = [
  ...html.matchAll(
    /<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["'][^>]*>/gi,
  ),
];
invariant(
  moduleScriptMatches.length === 1,
  `expected one production module entry, found ${moduleScriptMatches.length}`,
);
invariant(
  !/registerSW\.js|serviceWorker\.register|navigator\.serviceWorker\.register/i.test(
    html,
  ),
  'built HTML contains an independently injected service-worker registration path',
);

const entryAsset = moduleScriptMatches[0]![1]!;
const entryFile = path.join(distDir, entryAsset.replace(/^\//, ''));
const entryMap = await readJson<SourceMap>(`${entryFile}.map`);
const entrySources = (entryMap.sources ?? []).map(normalizeSource);
invariant(
  entrySources.some((source) => source.endsWith('/src/preflight.ts')),
  'production HTML entry does not resolve to src/preflight.ts',
);
invariant(
  !entrySources.some((source) => source.endsWith('/src/main.tsx')),
  'src/main.tsx was bundled into the initial preflight entry instead of remaining dynamically imported',
);

const assetNames = await readdir(assetsDir);
let helperImplementationMaps = 0;
for (const assetName of assetNames) {
  if (!assetName.endsWith('.js.map')) continue;
  const sourceMap = await readJson<SourceMap>(path.join(assetsDir, assetName));
  const sources = (sourceMap.sources ?? []).map(normalizeSource);
  if (
    sources.some((source) =>
      source.endsWith('/src/lib/invite-bootstrap-runtime.ts'),
    )
  ) {
    helperImplementationMaps += 1;
  }
}
invariant(
  helperImplementationMaps === 1,
  `expected one stateful invite-bootstrap implementation in built chunks, found ${helperImplementationMaps}`,
);

const worker = await readFile(path.join(distDir, 'sw.js'), 'utf8');
for (const requiredLiteral of [
  'credential-cache-v1',
  'remote-public-cache-v2',
  'remote-api-cache',
]) {
  invariant(
    worker.includes(requiredLiteral),
    `built service worker is missing security literal ${requiredLiteral}`,
  );
}
invariant(
  !worker.includes('remote-public-cache-v1'),
  'built service worker still references the pre-fix active runtime cache name',
);

const workerMap = await readJson<SourceMap>(path.join(distDir, 'sw.js.map'));
const workerSources = (workerMap.sources ?? []).map(normalizeSource);
const workerSourceIndex = workerSources.findIndex((source) =>
  source.endsWith('/src/sw.ts'),
);
invariant(
  workerSourceIndex >= 0,
  'built service-worker sourcemap omits src/sw.ts',
);
const workerSource = workerMap.sourcesContent?.[workerSourceIndex] ?? '';
invariant(
  workerSource.includes('new NetworkOnly()') &&
    workerSource.includes("url.pathname === '/api'") &&
    workerSource.includes('requestCarriesCredentialHeader(request)') &&
    workerSource.includes('hasSensitiveInviteRequestUrl(url)'),
  'built service worker no longer contains the source-controlled /api NetworkOnly and credential-sensitive cache guards',
);

console.log(
  '[verify-security-build] preflight entry, single invite helper state, and service-worker security contracts verified',
);
