import { readdir, stat } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = join(__dirname, 'screenshots');

interface ScreenshotEntry {
  name: string;
  viewport: string;
  path: string;
  sizeBytes: number;
}

async function walkDir(
  dir: string,
  baseDir: string,
): Promise<ScreenshotEntry[]> {
  const entries: ScreenshotEntry[] = [];
  const items = await readdir(dir);

  for (const item of items) {
    const fullPath = join(dir, item);
    const s = await stat(fullPath);

    if (s.isDirectory()) {
      entries.push(...(await walkDir(fullPath, baseDir)));
    } else if (item.endsWith('.png')) {
      const relPath = relative(baseDir, fullPath);
      const parts = relPath.split('/');
      const viewport = parts.length > 1 ? (parts[0] ?? 'unknown') : 'unknown';
      const name = item.replace(/\.png$/, '');

      entries.push({
        name,
        viewport,
        path: relPath,
        sizeBytes: s.size,
      });
    }
  }

  return entries;
}

async function main(): Promise<void> {
  try {
    const s = await stat(SCREENSHOT_DIR);
    if (!s.isDirectory()) {
      throw new Error('Not a directory');
    }
  } catch {
    console.error(
      `No screenshots found at ${SCREENSHOT_DIR}. Run "npm run test:screenshots" first.`,
    );
    process.exit(1);
  }

  const screenshots = await walkDir(SCREENSHOT_DIR, SCREENSHOT_DIR);

  const manifest = {
    generatedAt: new Date().toISOString(),
    totalScreenshots: screenshots.length,
    viewports: [...new Set(screenshots.map((s) => s.viewport))],
    screenshots: screenshots.sort((a, b) => {
      const vp = a.viewport.localeCompare(b.viewport);
      return vp !== 0 ? vp : a.name.localeCompare(b.name);
    }),
  };

  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
