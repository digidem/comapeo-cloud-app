import { stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { chromium } from 'playwright';
import sharp from 'sharp';

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

  const metadata = await sharp(path).metadata();

  if (metadata.width !== IMAGE_WIDTH || metadata.height !== IMAGE_HEIGHT) {
    throw new Error(
      `Expected ${IMAGE_WIDTH}x${IMAGE_HEIGHT}, received ${metadata.width}x${metadata.height}.`,
    );
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

    const screenshotBuffer = await page.screenshot({
      animations: 'disabled',
      fullPage: false,
      omitBackground: false,
      type: 'png',
    });

    // Optimize: convert to 8-bit palette PNG for ~88% size reduction
    const optimized = await sharp(screenshotBuffer)
      .png({ palette: true, effort: 10 })
      .toBuffer();

    await writeFile(outputPath, optimized);
  } finally {
    await browser.close();
  }

  await assertOutputDimensions(outputPath);

  const { size } = await stat(outputPath);
  const kb = (size / 1024).toFixed(0);

  console.log(`Generated ${outputPath} at ${IMAGE_WIDTH}x${IMAGE_HEIGHT} (${kb}KB).`);
}

await generateOgImage();
