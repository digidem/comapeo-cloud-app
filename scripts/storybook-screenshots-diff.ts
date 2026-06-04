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
 *   --check       (default) Diff current vs baseline using pixel-level
 *                 comparison (0.1% tolerance via pixelmatch). Exits 0 if
 *                 they match within threshold, 1 if anything differs.
 *
 * The script re-uses scripts/storybook-screenshots.ts via its CLI flags
 * (--skip-build, --viewport) so we don't duplicate the build/serve/capture
 * pipeline.
 *
 * See issue #88 — visual QA has no baseline/diff regression detection.
 */
import { execSync } from 'node:child_process';
import {
  type Dirent,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const ROOT = resolve(import.meta.dirname, '..');
const CURRENT_DIR = resolve(ROOT, 'tests/e2e/screenshots');
const BASELINE_DIR = resolve(ROOT, 'tests/e2e/storybook-screenshots-baseline');
const STORYBOOK_VIEWPORTS = ['mobile', 'desktop'] as const;
type Viewport = (typeof STORYBOOK_VIEWPORTS)[number];

const args = process.argv.slice(2);
const update = args.includes('--update');

const log = (msg: string) => console.log(`[sb-screenshots-diff] ${msg}`);

// ---------------------------------------------------------------------------
// 1. Generate current screenshots
// ---------------------------------------------------------------------------

function generateCurrent(viewport: Viewport, skipBuild: boolean): void {
  log(`Generating ${viewport} screenshots...`);
  const skipFlag = skipBuild ? ' --skip-build' : '';
  execSync(
    `npx tsx scripts/storybook-screenshots.ts${skipFlag} --viewport ${viewport}`,
    { cwd: ROOT, stdio: 'inherit' },
  );
}

// ---------------------------------------------------------------------------
// 2. List PNG files in a directory
// ---------------------------------------------------------------------------

async function listPngs(dir: string): Promise<Map<string, string>> {
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
        result.set(rel, abs);
      }
    }
  }
  await walk(dir);
  return result;
}

// ---------------------------------------------------------------------------
// 3. Pixel-diff two PNG buffers (0.1% tolerance)
// ---------------------------------------------------------------------------

/** Fraction of pixels allowed to differ (0.1%). */
const PIXEL_THRESHOLD = 0.001;

/**
 * Returns true if the two PNG buffers are visually identical within the
 * configured pixel threshold. Returns false for size mismatches or when
 * the fraction of differing pixels exceeds the threshold.
 */
function pixelsMatch(bufA: Buffer, bufB: Buffer): boolean {
  const imgA = PNG.sync.read(bufA);
  const imgB = PNG.sync.read(bufB);
  if (imgA.width !== imgB.width || imgA.height !== imgB.height) return false;
  const totalPixels = imgA.width * imgA.height;
  const mismatched = pixelmatch(
    imgA.data,
    imgB.data,
    null,
    imgA.width,
    imgA.height,
    { threshold: 0.1 },
  );
  return mismatched / totalPixels <= PIXEL_THRESHOLD;
}

// ---------------------------------------------------------------------------
// 4. Diff two file manifests using pixel comparison
// ---------------------------------------------------------------------------

interface DiffResult {
  added: string[];
  removed: string[];
  changed: string[];
  unchanged: number;
}

async function diffManifests(
  currentFiles: Map<string, string>,
  baselineFiles: Map<string, string>,
): Promise<DiffResult> {
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  let unchanged = 0;
  for (const [file, absCurrent] of currentFiles) {
    const absBaseline = baselineFiles.get(file);
    if (absBaseline === undefined) {
      added.push(file);
    } else {
      const [bufCurrent, bufBaseline] = await Promise.all([
        readFile(absCurrent),
        readFile(absBaseline),
      ]);
      if (pixelsMatch(bufCurrent, bufBaseline)) {
        unchanged++;
      } else {
        changed.push(file);
      }
    }
  }
  for (const file of baselineFiles.keys()) {
    if (!currentFiles.has(file)) removed.push(file);
  }
  return { added, removed, changed, unchanged };
}

// ---------------------------------------------------------------------------
// 5. Update baseline from current
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
// 6. Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  let exitCode = 0;
  for (const viewport of STORYBOOK_VIEWPORTS) {
    log(`--- ${viewport} ---`);
    generateCurrent(viewport, update);

    const currentDir = join(CURRENT_DIR, viewport, 'storybook');
    const baselineDir = join(BASELINE_DIR, viewport);

    if (update) {
      await updateBaseline(viewport);
      continue;
    }

    // check mode
    const [currentFiles, baselineFiles] = await Promise.all([
      listPngs(currentDir),
      listPngs(baselineDir),
    ]);
    if (baselineFiles.size === 0) {
      log(`ERROR: No baseline found at ${relative(ROOT, baselineDir)}.`);
      log(
        `Run \`npm run storybook:screenshots:baseline\` locally and commit the baseline, ` +
          `then re-run this check.`,
      );
      exitCode = 1;
      continue;
    }
    const result = await diffManifests(currentFiles, baselineFiles);
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
        `If these changes are intentional, run \`npm run storybook:screenshots:baseline\` ` +
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
