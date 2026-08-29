import { expect, test } from '@playwright/test';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import * as ts from 'typescript';

async function buildDeflateFixture(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('VERSION', '1.0');
  zip.file(
    'style.json',
    JSON.stringify({
      version: 8,
      sources: {},
      layers: [],
      metadata: { canary: 'production-smp-zip-reader' },
    }),
  );
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

async function productionSmpZipBrowserModule(): Promise<string> {
  const source = await readFile(
    path.resolve(process.cwd(), 'src/lib/map/smp-zip.ts'),
    'utf8',
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
    },
    fileName: 'smp-zip.ts',
  }).outputText;
  return `${compiled}\n;globalThis.__COMAPEO_SMP_ZIP_E2E__ = { inspectSmpZipCentralDirectory, validateSmpZipLocalEntryLayout, createSmpZipAggregateBudget, readBoundedSmpZipEntry };`;
}

test.describe('authored SMP DEFLATE support', () => {
  test('production SMP ZIP parser reads raw DEFLATE and rejects corruption', async ({
    page,
  }) => {
    const fixture = await buildDeflateFixture();
    await page.goto('about:blank');
    await page.addScriptTag({
      type: 'module',
      content: await productionSmpZipBrowserModule(),
    });
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            '__COMAPEO_SMP_ZIP_E2E__' in
            (globalThis as unknown as Record<string, unknown>),
        ),
      )
      .toBe(true);

    const result = await page.evaluate(async (fixtureBytes) => {
      type BrowserApi = {
        inspectSmpZipCentralDirectory: (blob: Blob) => Promise<{
          centralDirectoryOffset: number;
          entries: Array<{
            name: string;
            compressionMethod: number;
            localHeaderOffset: number;
            compressedSize: number;
          }>;
        }>;
        validateSmpZipLocalEntryLayout: (
          blob: Blob,
          inspection: unknown,
        ) => Promise<void>;
        createSmpZipAggregateBudget: () => { emittedBytes: bigint };
        readBoundedSmpZipEntry: (
          blob: Blob,
          entry: unknown,
          budget: { emittedBytes: bigint },
          signal: AbortSignal,
          inspection: unknown,
        ) => Promise<Uint8Array>;
      };
      const api = (
        globalThis as unknown as {
          __COMAPEO_SMP_ZIP_E2E__: BrowserApi;
        }
      ).__COMAPEO_SMP_ZIP_E2E__;
      const bytes = new Uint8Array(fixtureBytes);
      const blob = new Blob([bytes], { type: 'application/zip' });
      const inspection = await api.inspectSmpZipCentralDirectory(blob);
      await api.validateSmpZipLocalEntryLayout(blob, inspection);
      const styleEntry = inspection.entries.find(
        (entry) => entry.name === 'style.json',
      );
      if (!styleEntry) throw new Error('style.json missing from fixture');
      const styleBytes = await api.readBoundedSmpZipEntry(
        blob,
        styleEntry,
        api.createSmpZipAggregateBudget(),
        new AbortController().signal,
        inspection,
      );

      const corrupted = bytes.slice();
      const localView = new DataView(
        corrupted.buffer,
        corrupted.byteOffset,
        corrupted.byteLength,
      );
      const nameLength = localView.getUint16(
        styleEntry.localHeaderOffset + 26,
        true,
      );
      const extraLength = localView.getUint16(
        styleEntry.localHeaderOffset + 28,
        true,
      );
      const dataStart =
        styleEntry.localHeaderOffset + 30 + nameLength + extraLength;
      corrupted[dataStart] = (corrupted[dataStart] ?? 0) ^ 0x01;
      const corruptBlob = new Blob([corrupted], { type: 'application/zip' });
      const corruptInspection =
        await api.inspectSmpZipCentralDirectory(corruptBlob);
      await api.validateSmpZipLocalEntryLayout(corruptBlob, corruptInspection);
      const corruptEntry = corruptInspection.entries.find(
        (entry) => entry.name === 'style.json',
      );
      if (!corruptEntry) throw new Error('corrupt style.json missing');
      let corruptionRejected = false;
      try {
        await api.readBoundedSmpZipEntry(
          corruptBlob,
          corruptEntry,
          api.createSmpZipAggregateBudget(),
          new AbortController().signal,
          corruptInspection,
        );
      } catch {
        corruptionRejected = true;
      }

      return {
        compressionMethod: styleEntry.compressionMethod,
        styleText: new TextDecoder().decode(styleBytes),
        corruptionRejected,
      };
    }, Array.from(fixture));

    expect(result.compressionMethod).toBe(8);
    expect(JSON.parse(result.styleText)).toMatchObject({
      version: 8,
      metadata: { canary: 'production-smp-zip-reader' },
    });
    expect(result.corruptionRejected).toBe(true);
  });
});
