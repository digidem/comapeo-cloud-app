import { mkdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const IMAGE_WIDTH = 1200;
const IMAGE_HEIGHT = 630;

const scriptDir = dirname(fileURLToPath(import.meta.url));
const htmlPath = resolve(scriptDir, 'generate-og-image.html');
const outputPath = resolve(scriptDir, '../public/og-image.png');

async function assertOutputDimensions(path: string): Promise<void> {
  const image = await stat(path);

  if (!image.isFile()) {
    throw new Error(`Expected ${path} to be a file.`);
  }

  const browser = await chromium.launch();

  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(path).href);

    const dimensions = await page.evaluate(() => {
      const image = document.querySelector('img');

      return {
        height: image?.naturalHeight,
        width: image?.naturalWidth,
      };
    });

    if (
      dimensions.width !== IMAGE_WIDTH ||
      dimensions.height !== IMAGE_HEIGHT
    ) {
      throw new Error(
        `Expected ${IMAGE_WIDTH}x${IMAGE_HEIGHT}, received ${dimensions.width}x${dimensions.height}.`,
      );
    }
  } finally {
    await browser.close();
  }
}

async function generateOgImage(): Promise<void> {
  const browser = await chromium.launch();

  try {
    const page = await browser.newPage({
      deviceScaleFactor: 1,
      viewport: { height: IMAGE_HEIGHT, width: IMAGE_WIDTH },
    });

    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await mkdir(dirname(outputPath), { recursive: true });
    await page.screenshot({
      animations: 'disabled',
      fullPage: false,
      omitBackground: false,
      path: outputPath,
      type: 'png',
    });
  } finally {
    await browser.close();
  }

  await assertOutputDimensions(outputPath);
  console.log(`Generated ${outputPath} at ${IMAGE_WIDTH}x${IMAGE_HEIGHT}.`);
}

await generateOgImage();
