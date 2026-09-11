import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { type Plugin, type Rollup, build } from 'vite';

const root = process.cwd();
const virtualId = 'virtual:reference-import-entry';
const resolvedVirtualId = `\0${virtualId}`;

const virtualEntryPlugin: Plugin = {
  name: 'issue-311-reference-import-entry',
  resolveId(id) {
    if (id === virtualId) return resolvedVirtualId;
    return null;
  },
  load(id) {
    if (id !== resolvedVirtualId) return null;
    return `import {
      prepareReferenceImportBatch,
      detectReferenceImportFormat,
      REFERENCE_IMPORT_ACCEPT,
    } from '@/lib/map/reference-layer-import';
    globalThis.__issue311ReferenceImportProbe = {
      prepareReferenceImportBatch,
      detectReferenceImportFormat,
      REFERENCE_IMPORT_ACCEPT,
    };`;
  },
};

function packageTags(moduleIds: readonly string[]): string[] {
  const tags = new Set<string>();
  for (const id of moduleIds) {
    if (id.includes('/node_modules/@tmcw/togeojson/'))
      tags.add('@tmcw/togeojson');
    if (id.includes('/node_modules/shpjs/')) tags.add('shpjs');
    if (id.includes('/node_modules/proj4/')) tags.add('proj4');
    if (id.includes('/node_modules/@gmaclennan/zip-reader/')) {
      tags.add('@gmaclennan/zip-reader');
    }
  }
  return [...tags].sort();
}

function chunkBytes(chunk: Rollup.OutputChunk) {
  const raw = Buffer.byteLength(chunk.code);
  return {
    raw,
    gzip: gzipSync(chunk.code).byteLength,
  };
}

const result = await build({
  configFile: false,
  root,
  logLevel: 'silent',
  resolve: {
    alias: {
      '@': path.resolve(root, 'src'),
    },
  },
  plugins: [virtualEntryPlugin],
  build: {
    write: false,
    minify: true,
    sourcemap: false,
    target: 'es2022',
    rollupOptions: {
      input: virtualId,
    },
  },
});

const outputs = Array.isArray(result) ? result : [result];
const chunks = outputs.flatMap((output) =>
  'output' in output
    ? output.output.filter(
        (
          item: Rollup.OutputChunk | Rollup.OutputAsset,
        ): item is Rollup.OutputChunk => item.type === 'chunk',
      )
    : [],
);
const entry = chunks.find((chunk) => chunk.isEntry);
if (!entry) throw new Error('Synthetic importer build emitted no entry chunk');

const entryPackages = packageTags(Object.keys(entry.modules));
if (entryPackages.length > 0) {
  throw new Error(
    `Heavy import packages leaked into the synthetic entry chunk: ${entryPackages.join(', ')}`,
  );
}

const requiredPackages = [
  '@tmcw/togeojson',
  'shpjs',
  'proj4',
  '@gmaclennan/zip-reader',
] as const;
const converterChunks = chunks
  .map((chunk) => ({
    chunk,
    packages: packageTags(Object.keys(chunk.modules)),
  }))
  .filter(({ packages }) => packages.length > 0);

for (const packageName of requiredPackages) {
  if (!converterChunks.some(({ packages }) => packages.includes(packageName))) {
    throw new Error(`Synthetic importer build did not emit ${packageName}`);
  }
}

const summary = {
  entry: {
    fileName: entry.fileName,
    ...chunkBytes(entry),
    staticPackageLeaks: entryPackages,
    dynamicImports: entry.dynamicImports,
  },
  converterChunks: converterChunks.map(({ chunk, packages }) => ({
    fileName: chunk.fileName,
    ...chunkBytes(chunk),
    isDynamicEntry: chunk.isDynamicEntry,
    packages,
  })),
};

console.log(JSON.stringify(summary, null, 2));
