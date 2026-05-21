/**
 * Storybook Screenshot Capture (Mobile + Desktop)
 *
 * Builds static Storybook, starts a lightweight HTTP server via Node's http
 * module, then uses Playwright to capture every story at both mobile
 * (375x812) and desktop (1440x900) viewports. No external dependencies
 * needed.
 *
 * Produces PNGs in:
 *   tests/e2e/screenshots/mobile/storybook/
 *   tests/e2e/screenshots/desktop/storybook/
 *
 * Usage:
 *   npx tsx scripts/storybook-screenshots.ts
 *   npx tsx scripts/storybook-screenshots.ts --skip-build
 *   npx tsx scripts/storybook-screenshots.ts --viewport mobile
 *   npx tsx scripts/storybook-screenshots.ts --viewport desktop
 *
 * Requires: npx playwright install chromium
 */
import { execSync } from 'node:child_process';
import { mkdir, readFile, readdir, rm, stat } from 'node:fs/promises';
import { type Server, createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { type Browser, type BrowserContext, chromium } from 'playwright';

const ROOT = resolve(import.meta.dirname, '..');
const SCREENSHOT_DIR = resolve(ROOT, 'tests/e2e/screenshots');
const STORYBOOK_STATIC = resolve(ROOT, 'storybook-static');
const INDEX_JSON = resolve(STORYBOOK_STATIC, 'index.json');

const VIEWPORTS = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1440, height: 900 },
} as const;

type ViewportName = keyof typeof VIEWPORTS;

const PORT = 0; // 0 = OS-assigned ephemeral port

interface StoryEntry {
  id: string;
  title: string;
  name: string;
}

// ---------------------------------------------------------------------------
// MIME types
// ---------------------------------------------------------------------------

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

async function buildStorybook(): Promise<void> {
  console.log('[sb-screenshots] Building static Storybook...');
  execSync('npm run build-storybook', { cwd: ROOT, stdio: 'inherit' });
  console.log('[sb-screenshots] Build complete.');
}

// ---------------------------------------------------------------------------
// Lightweight HTTP server
// ---------------------------------------------------------------------------

function startServer(): Promise<{ url: string; stop: () => void }> {
  return new Promise((resolve, reject) => {
    const server: Server = createServer(async (req, res) => {
      const urlPath = req.url?.split('?')[0] ?? '/';
      // Serve from storybook-static, defaulting to index.html for SPA
      let filePath = join(
        STORYBOOK_STATIC,
        urlPath === '/' ? 'index.html' : urlPath,
      );

      try {
        const s = await stat(filePath);
        if (s.isDirectory()) {
          filePath = join(filePath, 'index.html');
        }
        const data = await readFile(filePath);
        const ext = extname(filePath);
        const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.listen(PORT, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to get server address'));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        stop: () => server.close(),
      });
    });

    server.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Discover stories from disk
// ---------------------------------------------------------------------------

async function getStories(): Promise<StoryEntry[]> {
  const raw = await readFile(INDEX_JSON, 'utf8');
  const data = JSON.parse(raw) as {
    entries: Record<string, StoryEntry>;
  };
  return Object.values(data.entries).filter(
    (e) => e.id && !e.id.startsWith('docs--'),
  );
}

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

async function captureViewport(
  browser: Browser,
  baseUrl: string,
  stories: StoryEntry[],
  viewportName: ViewportName,
): Promise<{ captured: number; failed: number }> {
  const viewport = VIEWPORTS[viewportName];
  const outputDir = join(SCREENSHOT_DIR, viewportName, 'storybook');

  let captured = 0;
  let failed = 0;

  const context: BrowserContext = await browser.newContext({
    viewport,
    reducedMotion: 'reduce',
  });

  try {
    for (const story of stories) {
      const slug = story.id.replace(/\//g, '-').replace(/[^a-z0-9-]/gi, '-');
      const filePath = join(outputDir, `${slug}.png`);
      const prefix = `[${viewportName} ${captured + failed + 1}/${stories.length}]`;

      process.stdout.write(`${prefix} ${story.id}...`);

      const page = await context.newPage();
      try {
        const url = `${baseUrl}/iframe.html?id=${encodeURIComponent(story.id)}&viewMode=story`;
        await page.goto(url, {
          waitUntil: 'load',
          timeout: 30_000,
        });

        // Wait for React to render
        await page.waitForTimeout(1500);
        await page.evaluate(() => document.fonts.ready);

        await page.screenshot({
          path: filePath,
          fullPage: true,
        });

        captured++;
        console.log(' OK');
      } catch (err) {
        failed++;
        console.log(` FAIL: ${err}`);
      } finally {
        await page.close();
      }
    }
  } finally {
    await context.close();
  }

  return { captured, failed };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function parseViewportFilter(): ViewportName[] | undefined {
  const idx = process.argv.indexOf('--viewport');
  if (idx === -1) return undefined;
  const value = process.argv[idx + 1];
  if (!value) {
    console.error('Missing value for --viewport. Use "mobile" or "desktop".');
    process.exit(1);
  }
  if (value === 'mobile' || value === 'desktop') return [value];
  console.error(`Unknown viewport "${value}". Use "mobile" or "desktop".`);
  process.exit(1);
}

async function main(): Promise<void> {
  const skipBuild = process.argv.includes('--skip-build');
  const viewportFilter = parseViewportFilter();
  const viewports: ViewportName[] = viewportFilter ?? ['mobile', 'desktop'];

  if (!skipBuild) {
    await buildStorybook();
  } else {
    console.log('[sb-screenshots] Skipping build (--skip-build).');
  }

  const stories = await getStories();
  console.log(`[sb-screenshots] Found ${stories.length} stories.\n`);

  const { url: baseUrl, stop: stopServer } = await startServer();
  console.log(`[sb-screenshots] Serving at ${baseUrl}\n`);

  const browser = await chromium.launch();
  try {
    let totalCaptured = 0;
    let totalFailed = 0;

    for (const viewportName of viewports) {
      const outputDir = join(SCREENSHOT_DIR, viewportName, 'storybook');

      // Clean output directory for this viewport
      await rm(outputDir, { recursive: true, force: true });
      await mkdir(outputDir, { recursive: true });

      console.log(
        `\n[sb-screenshots] Capturing ${viewportName} (${VIEWPORTS[viewportName].width}x${VIEWPORTS[viewportName].height})...`,
      );

      const { captured, failed } = await captureViewport(
        browser,
        baseUrl,
        stories,
        viewportName,
      );

      totalCaptured += captured;
      totalFailed += failed;

      console.log(
        `[sb-screenshots] ${viewportName}: ${captured} captured, ${failed} failed.`,
      );

      // List what was captured
      const files = await readdir(outputDir);
      for (const f of files.sort()) {
        console.log(`  ${viewportName}/${f}`);
      }
    }

    console.log(
      `\n[sb-screenshots] All done. ${totalCaptured} captured, ${totalFailed} failed.`,
    );

    if (totalFailed > 0) {
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
    stopServer();
  }
}

main().catch((err: unknown) => {
  console.error('[sb-screenshots] Failed:', err);
  process.exit(1);
});
