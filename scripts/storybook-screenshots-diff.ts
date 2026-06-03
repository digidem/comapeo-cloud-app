/**
 * Storybook screenshot baseline + diff.
 *
 * Compares the current storybook-screenshots output against a checked-in
 * baseline (tests/e2e/storybook-screenshots-baseline/{mobile,desktop}/).
 * Designed to run on CI to surface visual regressions introduced by a PR.
 *
 * Modes:
 *   --update      Copy current screenshots to the baseline (one-way).
 *                 Run on main / when intentionally changing a story's
 *                 appearance. Adds any new files, removes any deleted
 *                 ones, overwrites any changed ones.
 *   --check       (default) Diff current vs baseline. Exits 0 if they
 *                 match byte-for-byte, 1 if anything differs.
 *
 * The script re-uses scripts/storybook-screenshots.ts via its CLI flags
 * (--skip-build, --viewport) so we don't duplicate the build/serve/capture
 * pipeline.
 *
 * See issue #88 — visual QA has no baseline/diff regression detection.
 */
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  type Dirent,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const CURRENT_DIR = resolve(ROOT, 'tests/e2e/screenshots');
const BASELINE_DIR = resolve(ROOT, 'tests/e2e/storybook-screenshots-baseline');
const STORYBOOK_VIEWPORTS = ['mobile', 'desktop'] as const;
type Viewport = (typeof STORYBOOK_VIEWPORTS)[number];

const args = process.argv.slice(2);
const update = args.includes('--update');
const check = !update; // default

const log = (msg: string) => console.log(`[sb-screenshots-diff] ${msg}`);

// ---------------------------------------------------------------------------
// 1. Generate current screenshots
// ---------------------------------------------------------------------------

function generateCurrent(viewport: Viewport): void {
  log(`Generating ${viewport} screenshots...`);
  execSync(
    `npx tsx scripts/storybook-screenshots.ts --skip-build --viewport ${viewport}`,
    { cwd: ROOT, stdio: 'inherit' },
  );
}

// ---------------------------------------------------------------------------
// 2. Hash a directory's PNG files into a manifest
// ---------------------------------------------------------------------------

async function hashDir(dir: string): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  async function walk(d: string, prefix = ''): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw err;
    }
    for (const entry of entries) {
      const abs = join(d, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(abs, rel);
      } else if (entry.name.endsWith('.png')) {
        const buf = await readFile(abs);
        result.set(rel, createHash('sha256').update(buf).digest('hex'));
      }
    }
  }
  await walk(dir);
  return result;
}

// ---------------------------------------------------------------------------
// 3. Diff two manifests
// ---------------------------------------------------------------------------

interface DiffResult {
  added: string[];
  removed: string[];
  changed: string[];
  unchanged: number;
}

function diffManifests(
  current: Map<string, string>,
  baseline: Map<string, string>,
): DiffResult {
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  let unchanged = 0;
  for (const [file, hash] of current) {
    const prior = baseline.get(file);
    if (prior === undefined) added.push(file);
    else if (prior !== hash) changed.push(file);
    else unchanged++;
  }
  for (const file of baseline.keys()) {
    if (!current.has(file)) removed.push(file);
  }
  return { added, removed, changed, unchanged };
}

// ---------------------------------------------------------------------------
// 4. Update baseline from current
// ---------------------------------------------------------------------------

async function updateBaseline(viewport: Viewport): Promise<void> {
  const src = join(CURRENT_DIR, viewport, 'storybook');
  const dst = join(BASELINE_DIR, viewport);
  await mkdir(dst, { recursive: true });
  // Clear dst so removed screenshots actually disappear from baseline.
  await rm(dst, { recursive: true, force: true });
  await mkdir(dst, { recursive: true });
  let copied = 0;
  async function walk(from: string, to: string): Promise<void> {
    const entries = await readdir(from, { withFileTypes: true });
    for (const e of entries) {
      const absFrom = join(from, e.name);
      const absTo = join(to, e.name);
      if (e.isDirectory()) {
        await mkdir(absTo, { recursive: true });
        await walk(absFrom, absTo);
      } else if (e.name.endsWith('.png')) {
        await readFile(absFrom).then((buf) => writeFile(absTo, buf));
        copied++;
      }
    }
  }
  await walk(src, dst);
  log(
    `Updated ${viewport} baseline: ${copied} files copied to ${relative(ROOT, dst)}`,
  );
}

// ---------------------------------------------------------------------------
// 5. Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  let exitCode = 0;
  for (const viewport of STORYBOOK_VIEWPORTS) {
    log(`--- ${viewport} ---`);
    generateCurrent(viewport);

    const currentDir = join(CURRENT_DIR, viewport, 'storybook');
    const baselineDir = join(BASELINE_DIR, viewport);

    if (update) {
      await updateBaseline(viewport);
      continue;
    }

    // check mode
    const [current, baseline] = await Promise.all([
      hashDir(currentDir),
      hashDir(baselineDir),
    ]);
    if (baseline.size === 0) {
      log(
        `No baseline at ${relative(ROOT, baselineDir)} — populating from current. ` +
          `Commit the baseline so future runs have something to diff against.`,
      );
      await updateBaseline(viewport);
      continue;
    }
    const result = diffManifests(current, baseline);
    log(
      `${result.unchanged} unchanged, ${result.added.length} added, ` +
        `${result.removed.length} removed, ${result.changed.length} changed.`,
    );
    const issues = [...result.added, ...result.removed, ...result.changed];
    if (issues.length > 0) {
      exitCode = 1;
      log(`Visual regressions in ${viewport}:`);
      for (const file of issues) {
        log(`  - ${viewport}/${file.split(sep).join('/')}`);
      }
      log(
        `If these changes are intentional, run \`npm run storybook:screenshots:diff -- --update\` ` +
          `locally and commit the new baseline.`,
      );
    }
  }
  if (exitCode === 0) log('All viewports match baseline ✅');
  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
