/**
 * Delete all `.map` files from `dist/` after source map upload.
 *
 * Hidden source maps (`sourcemap: 'hidden'` in Vite) still generate `.map`
 * files — they only suppress `sourceMappingURL` comments in JS bundles.
 * This script removes them from the deploy directory so they are never
 * publicly accessible.
 *
 * Usage:  npx tsx scripts/clean-sourcemaps.ts [--assert-only]
 *
 * --assert-only   Don't delete; just fail if any `.map` files remain.
 */
import { existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

const assertOnly = process.argv.includes('--assert-only');
const rootDir = resolve(import.meta.dirname ?? '.', '..');
const distDir = resolve(rootDir, 'dist');

function walk(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = resolve(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...walk(fullPath));
    } else if (entry.endsWith('.map')) {
      results.push(fullPath);
    }
  }
  return results;
}

if (!existsSync(distDir)) {
  console.error('[clean-sourcemaps] ERROR: dist/ directory does not exist.');
  process.exit(1);
}

const mapFiles = walk(distDir);

if (mapFiles.length === 0) {
  console.log('[clean-sourcemaps] No .map files found in dist/. Clean.');
  process.exit(0);
}

if (assertOnly) {
  console.error(
    `[clean-sourcemaps] ERROR: Found ${mapFiles.length} .map file(s) in dist/ that should have been deleted:`,
  );
  for (const f of mapFiles) {
    console.error(`  ${f}`);
  }
  process.exit(1);
}

console.log(
  `[clean-sourcemaps] Deleting ${mapFiles.length} .map file(s) from dist/...`,
);
for (const file of mapFiles) {
  unlinkSync(file);
}
console.log('[clean-sourcemaps] All .map files deleted.');
