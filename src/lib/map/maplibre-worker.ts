import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

// MapLibre v6 is ESM-only and no longer inlines its worker: without this, the
// production build resolves the worker URL relative to the hashed vendor chunk
// and requests a `maplibre-gl-worker.mjs` that is never emitted (worker 404,
// map canvas stays blank). `?worker&url` — not plain `?url` — routes the
// worker through Vite's worker pipeline so the emitted chunk is self-contained
// (the dist worker's `maplibre-gl-shared.mjs` sibling import is bundled in).
setWorkerUrl(workerUrl);
