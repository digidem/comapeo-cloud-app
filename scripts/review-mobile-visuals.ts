/**
 * Visual Review Pipeline (Mobile + Desktop)
 *
 * Collects screenshots (E2E + Storybook) from mobile and/or desktop
 * directories, sends each to gpt-5.4-mini via the Codex CLI
 * (`codex exec`) for structured UX review, and outputs a JSON report.
 *
 * Usage:
 *   npx tsx scripts/review-mobile-visuals.ts                  # mobile only (backward compat)
 *   npx tsx scripts/review-mobile-visuals.ts --viewport mobile
 *   npx tsx scripts/review-mobile-visuals.ts --viewport desktop
 *   npx tsx scripts/review-mobile-visuals.ts --viewport both
 *   npx tsx scripts/review-mobile-visuals.ts --only storybook
 *   npx tsx scripts/review-mobile-visuals.ts --only e2e
 *   npx tsx scripts/review-mobile-visuals.ts --match settings
 *
 * Requires: codex CLI installed and logged in
 */
import { spawn } from 'node:child_process';
import {
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SCREENSHOT_DIR = resolve(ROOT, 'tests/e2e/screenshots');
const TMP_DIR = resolve(ROOT, 'tests/e2e/screenshots/.review-tmp');

const MODEL = 'gpt-5.4-mini';
const CONCURRENCY = 3;

type ViewportName = 'mobile' | 'desktop';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScreenshotInfo {
  name: string;
  path: string;
  source: 'e2e' | 'storybook';
  viewport: ViewportName;
  sizeBytes: number;
}

interface Issue {
  severity: 'CRITICAL' | 'MAJOR' | 'MINOR' | 'SUGGESTION';
  component: string;
  issue: string;
  recommendation: string;
}

interface ScreenshotReview {
  screenshot: string;
  source: string;
  viewport: string;
  model: string;
  issues: Issue[];
  rawResponse: string;
  error?: string;
}

interface ReviewReport {
  generatedAt: string;
  model: string;
  viewport: string;
  totalScreenshots: number;
  reviewed: number;
  errors: number;
  summary: {
    critical: number;
    major: number;
    minor: number;
    suggestion: number;
  };
  reviews: ScreenshotReview[];
}

// ---------------------------------------------------------------------------
// Review prompts
// ---------------------------------------------------------------------------

const MOBILE_PROMPT = `You are a senior mobile UX auditor reviewing a 375px-wide screenshot of a web dashboard for environmental monitoring teams (CoMapeo Cloud App). Be THOROUGH and CRITICAL — assume every page has issues to find.

For each issue found, provide:
1. Severity: CRITICAL (broken/unusable) | MAJOR (hard to use) | MINOR (suboptimal) | SUGGESTION (nice-to-have)
2. Component: Which UI element is affected
3. Issue: What's wrong
4. Recommendation: How to fix it

Focus areas (check ALL of these):
- Horizontal overflow / content wider than 375px viewport
- Text truncation or clipping
- Touch targets under 44px height/width
- Content cut off below the visible screen
- Form inputs wider than viewport or too narrow to use
- Buttons too small or too close together for touch
- Spacing and padding that wastes space or crowds elements
- Navigation elements that are hard to reach on mobile
- Cards or containers with fixed widths that don't adapt
- Font sizes below 14px (hard to read on mobile)
- Color contrast issues (WCAG AA)
- Images or media that don't scale

Respond ONLY with a JSON array of issues. If genuinely no issues found, respond with [].
Format:
[{"severity":"CRITICAL|MAJOR|MINOR|SUGGESTION","component":"...","issue":"...","recommendation":"..."}]`;

const DESKTOP_PROMPT = `You are a senior desktop UX auditor reviewing a 1440px-wide screenshot of a web dashboard for environmental monitoring teams (CoMapeo Cloud App). Be THOROUGH and CRITICAL — assume every page has issues to find.

For each issue found, provide:
1. Severity: CRITICAL (broken/unusable) | MAJOR (hard to use) | MINOR (suboptimal) | SUGGESTION (nice-to-have)
2. Component: Which UI element is affected
3. Issue: What's wrong
4. Recommendation: How to fix it

Focus areas (check ALL of these):
- Content not making good use of the wide viewport (excessive whitespace)
- Horizontal overflow or scrolling
- Text truncation or clipping
- Navigation elements that are hard to find or use
- Cards or containers with broken layouts at desktop width
- Font sizes that are too small for desktop viewing
- Color contrast issues (WCAG AA)
- Images or media that don't scale properly
- Inconsistent spacing or alignment
- Modal or dialog sizing issues
- Responsive breakpoints not applying correctly at 1440px
- Overall visual hierarchy and information density

Respond ONLY with a JSON array of issues. If genuinely no issues found, respond with [].
Format:
[{"severity":"CRITICAL|MAJOR|MINOR|SUGGESTION","component":"...","issue":"...","recommendation":"..."}]`;

// ---------------------------------------------------------------------------
// Screenshot discovery
// ---------------------------------------------------------------------------

async function discoverScreenshots(
  viewport: ViewportName,
  filter?: 'e2e' | 'storybook',
): Promise<ScreenshotInfo[]> {
  const results: ScreenshotInfo[] = [];
  const viewportDir = join(SCREENSHOT_DIR, viewport);

  try {
    await stat(viewportDir);
  } catch {
    console.error(
      `No ${viewport} screenshots found at ${viewportDir}. Run screenshot generation first.`,
    );
    process.exit(1);
  }

  async function walkDir(dir: string, source: 'e2e' | 'storybook') {
    const items = await readdir(dir);
    for (const item of items) {
      const fullPath = join(dir, item);
      const s = await stat(fullPath);
      if (s.isDirectory()) {
        await walkDir(fullPath, source);
      } else if (item.endsWith('.png')) {
        results.push({
          name: item.replace(/\.png$/, ''),
          path: fullPath,
          source,
          viewport,
          sizeBytes: s.size,
        });
      }
    }
  }

  // E2E screenshots (directly in viewport/ but not in storybook/)
  if (!filter || filter === 'e2e') {
    const items = await readdir(viewportDir);
    for (const item of items) {
      const fullPath = join(viewportDir, item);
      const s = await stat(fullPath);
      if (s.isDirectory() && item !== 'storybook') {
        await walkDir(fullPath, 'e2e');
      } else if (item.endsWith('.png')) {
        results.push({
          name: item.replace(/\.png$/, ''),
          path: fullPath,
          source: 'e2e',
          viewport,
          sizeBytes: s.size,
        });
      }
    }
  }

  // Storybook screenshots
  if (!filter || filter === 'storybook') {
    const sbDir = join(viewportDir, 'storybook');
    try {
      await stat(sbDir);
      await walkDir(sbDir, 'storybook');
    } catch {
      console.warn(
        `[review] No Storybook ${viewport} screenshots found, skipping.`,
      );
    }
  }

  return results.sort((a, b) => {
    const src = a.source.localeCompare(b.source);
    return src !== 0 ? src : a.name.localeCompare(b.name);
  });
}

// ---------------------------------------------------------------------------
// Codex CLI review
// ---------------------------------------------------------------------------

async function reviewScreenshot(
  screenshot: ScreenshotInfo,
): Promise<ScreenshotReview> {
  const tmpOutput = join(
    TMP_DIR,
    `${screenshot.viewport}-${screenshot.name}.txt`,
  );
  const prompt =
    screenshot.viewport === 'mobile' ? MOBILE_PROMPT : DESKTOP_PROMPT;
  const fullPrompt = `${prompt}\n\nScreenshot: "${screenshot.name}" (${screenshot.source}, ${screenshot.viewport})`;

  try {
    const child = spawn(
      'codex',
      [
        'exec',
        '-m',
        MODEL,
        '-i',
        screenshot.path,
        '-o',
        tmpOutput,
        '--json',
        '--ephemeral',
        '-c',
        'sandbox_permissions=["disk-full-read-access"]',
      ],
      {
        cwd: ROOT,
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));

    // Pass prompt via stdin (codex exec reads from stdin when no arg given)
    child.stdin.write(fullPrompt);
    child.stdin.end();

    // Wait for process to exit with timeout
    const exitCode = await new Promise<number | null>((resolveExit) => {
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        resolveExit(null);
      }, 60_000);
      child.on('exit', (code) => {
        clearTimeout(timer);
        resolveExit(code);
      });
    });

    if (exitCode === null) {
      return {
        screenshot: screenshot.name,
        source: screenshot.source,
        viewport: screenshot.viewport,
        model: MODEL,
        issues: [],
        rawResponse: '',
        error: 'Timed out after 60s',
      };
    }

    if (exitCode !== 0) {
      return {
        screenshot: screenshot.name,
        source: screenshot.source,
        viewport: screenshot.viewport,
        model: MODEL,
        issues: [],
        rawResponse: '',
        error: `codex exec exited with code ${exitCode}: ${stderr.trim() || 'no stderr'}`,
      };
    }

    // Parse the JSONL output to find the agent_message
    let rawContent = '';
    for (const line of stdout.split('\n')) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line) as {
          type: string;
          item?: { type: string; text: string };
        };
        if (
          parsed.type === 'item.completed' &&
          parsed.item?.type === 'agent_message'
        ) {
          rawContent = parsed.item.text;
        }
      } catch {
        // Not JSON, skip
      }
    }

    // Fallback: read the output file if JSONL parsing didn't work
    if (!rawContent) {
      try {
        rawContent = await readFile(tmpOutput, 'utf8');
      } catch {
        rawContent = '[]';
      }
    }

    // Parse the JSON response — handle markdown code blocks
    let issues: Issue[];
    try {
      const jsonStr = rawContent
        .replace(/^```json?\s*\n?/m, '')
        .replace(/\n?```\s*$/m, '')
        .trim();
      const parsed = JSON.parse(jsonStr);
      // Validate it's actually an array
      if (!Array.isArray(parsed)) {
        issues = [];
      } else {
        issues = parsed as Issue[];
      }
    } catch {
      issues = [];
    }

    return {
      screenshot: screenshot.name,
      source: screenshot.source,
      viewport: screenshot.viewport,
      model: MODEL,
      issues,
      rawResponse: rawContent,
    };
  } catch (err) {
    return {
      screenshot: screenshot.name,
      source: screenshot.source,
      viewport: screenshot.viewport,
      model: MODEL,
      issues: [],
      rawResponse: '',
      error: String(err),
    };
  } finally {
    // Clean up temp file
    try {
      await rm(tmpOutput);
    } catch {
      // ignore
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function parseViewports(): ViewportName[] {
  const idx = process.argv.indexOf('--viewport');
  if (idx === -1) return ['mobile']; // backward compat default

  const value = process.argv[idx + 1];
  if (!value) {
    console.error(
      'Missing value for --viewport. Use "mobile", "desktop", or "both".',
    );
    process.exit(1);
  }
  if (value === 'both') return ['mobile', 'desktop'];
  if (value === 'mobile') return ['mobile'];
  if (value === 'desktop') return ['desktop'];
  console.error(
    `Unknown viewport "${value}". Use "mobile", "desktop", or "both".`,
  );
  process.exit(1);
}

function parseFilter(): 'e2e' | 'storybook' | undefined {
  const idx = process.argv.indexOf('--only');
  if (idx === -1) return undefined;

  const value = process.argv[idx + 1];
  if (!value) {
    console.error('Missing value for --only. Use "e2e" or "storybook".');
    process.exit(1);
  }
  if (value !== 'e2e' && value !== 'storybook') {
    console.error(`Unknown --only value "${value}". Use "e2e" or "storybook".`);
    process.exit(1);
  }
  return value;
}

function parseMatch(): string | undefined {
  const idx = process.argv.indexOf('--match');
  if (idx === -1) return undefined;

  const value = process.argv[idx + 1];
  if (!value) {
    console.error('Missing value for --match. Provide a regex pattern.');
    process.exit(1);
  }
  return value;
}

async function main(): Promise<void> {
  // Verify codex is available
  try {
    const child = spawn('codex', ['--version'], { stdio: 'pipe' });
    await new Promise<void>((resolveCheck, rejectCheck) => {
      child.on('exit', (code) => {
        if (code === 0) resolveCheck();
        else rejectCheck(new Error('codex --version failed'));
      });
      child.on('error', rejectCheck);
    });
  } catch {
    console.error(
      'Error: codex CLI not found. Install it with: npm install -g @openai/codex',
    );
    process.exit(1);
  }

  const viewports = parseViewports();
  const filterValue = parseFilter();
  const matchPattern = parseMatch();

  // Collect screenshots from all requested viewports
  let screenshots: ScreenshotInfo[] = [];
  for (const vp of viewports) {
    const discovered = await discoverScreenshots(vp, filterValue);
    screenshots = screenshots.concat(discovered);
  }

  // Apply name filter if provided
  if (matchPattern) {
    const regex = new RegExp(matchPattern, 'i');
    screenshots = screenshots.filter((s) => regex.test(s.name));
  }

  if (screenshots.length === 0) {
    console.error('No screenshots found to review.');
    process.exit(1);
  }

  const viewportLabel = viewports.join('+');
  console.log(
    `[review] Found ${screenshots.length} screenshots to review (${filterValue ?? 'all sources'}, ${viewportLabel}).`,
  );
  console.log(`[review] Using model: ${MODEL} via codex CLI`);
  console.log(`[review] Concurrency: ${CONCURRENCY} parallel reviews\n`);

  // Create temp dir for codex output files
  await mkdir(TMP_DIR, { recursive: true });

  const reviews: ScreenshotReview[] = [];
  let errorCount = 0;
  let reviewIdx = 0;

  // Process with bounded concurrency
  async function processScreenshot(s: ScreenshotInfo) {
    // Use atomic pre-increment for accurate progress numbering
    const idx = ++reviewIdx;
    process.stdout.write(
      `[${idx}/${screenshots.length}] Reviewing "${s.name}" (${s.source}, ${s.viewport})...`,
    );

    const review = await reviewScreenshot(s);

    if (review.error) {
      errorCount++;
      console.log(` ERROR: ${review.error}`);
    } else {
      const counts = review.issues.length;
      const critical = review.issues.filter(
        (iss) => iss.severity === 'CRITICAL',
      ).length;
      const major = review.issues.filter(
        (iss) => iss.severity === 'MAJOR',
      ).length;
      const label =
        counts === 0
          ? 'clean'
          : `${counts} issues${critical ? ` (${critical} critical, ${major} major)` : ''}`;
      console.log(` ${label}`);
    }

    return review;
  }

  // Pool-based concurrency
  const pool = [...screenshots];
  const workers: Promise<void>[] = [];

  for (let w = 0; w < Math.min(CONCURRENCY, pool.length); w++) {
    workers.push(
      (async () => {
        while (pool.length > 0) {
          const s = pool.shift();
          if (!s) break;
          const review = await processScreenshot(s);
          reviews.push(review);
        }
      })(),
    );
  }

  await Promise.all(workers);

  // Clean up temp dir
  await rm(TMP_DIR, { recursive: true, force: true });

  // Build summary
  const allIssues = reviews.flatMap((r) => r.issues);
  const summary = {
    critical: allIssues.filter((i) => i.severity === 'CRITICAL').length,
    major: allIssues.filter((i) => i.severity === 'MAJOR').length,
    minor: allIssues.filter((i) => i.severity === 'MINOR').length,
    suggestion: allIssues.filter((i) => i.severity === 'SUGGESTION').length,
  };

  const report: ReviewReport = {
    generatedAt: new Date().toISOString(),
    model: MODEL,
    viewport: viewportLabel,
    totalScreenshots: screenshots.length,
    reviewed: reviews.length,
    errors: errorCount,
    summary,
    reviews,
  };

  // Write viewport-specific report
  const reportSuffix = viewports.length > 1 ? 'visual' : viewports[0];
  const reportPath = resolve(
    ROOT,
    `tests/e2e/screenshots/${reportSuffix}-review-report.json`,
  );
  await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log(`${viewportLabel.toUpperCase()} VISUAL REVIEW SUMMARY`);
  console.log('='.repeat(60));
  console.log(`Model:            ${MODEL}`);
  console.log(`Viewports:        ${viewportLabel}`);
  console.log(`Screenshots:      ${screenshots.length}`);
  console.log(`Reviewed:         ${reviews.length}`);
  console.log(`Errors:           ${errorCount}`);
  console.log(`Total issues:     ${allIssues.length}`);
  console.log(`  CRITICAL:       ${summary.critical}`);
  console.log(`  MAJOR:          ${summary.major}`);
  console.log(`  MINOR:          ${summary.minor}`);
  console.log(`  SUGGESTION:     ${summary.suggestion}`);
  console.log('='.repeat(60));

  // Print critical/major issues
  const criticalAndMajor = allIssues.filter(
    (i) => i.severity === 'CRITICAL' || i.severity === 'MAJOR',
  );
  if (criticalAndMajor.length > 0) {
    console.log('\nCRITICAL & MAJOR ISSUES:');
    for (const issue of criticalAndMajor) {
      const review = reviews.find((r) => r.issues.includes(issue));
      const screen = review?.screenshot ?? 'unknown';
      const vp = review?.viewport ?? 'unknown';
      console.log(
        `  [${issue.severity}] ${vp}/${screen} > ${issue.component}: ${issue.issue}`,
      );
      console.log(`    Fix: ${issue.recommendation}`);
    }
  }

  console.log(`\nReport saved to: ${relative(ROOT, reportPath)}`);
}

main().catch((err: unknown) => {
  console.error('[review] Failed:', err);
  process.exit(1);
});
