import { expect, test } from '@playwright/test';

test.describe('authored SMP DEFLATE support', () => {
  test('browser can stream raw DEFLATE with DecompressionStream', async ({
    page,
  }) => {
    await page.goto('/');
    const result = await page.evaluate(async () => {
      if (typeof DecompressionStream !== 'function') {
        return { supported: false, reason: 'DecompressionStream missing' };
      }
      try {
        // Raw DEFLATE bytes for UTF-8 "hello".
        const compressed = new Uint8Array([203, 72, 205, 201, 201, 7, 0]);
        const decompressor = new DecompressionStream(
          'deflate-raw' as CompressionFormat,
        );
        const stream = new Blob([compressed])
          .stream()
          .pipeThrough(decompressor);
        const reader = stream.getReader();
        const chunks: Uint8Array[] = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
        const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
        const output = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
          output.set(chunk, offset);
          offset += chunk.byteLength;
        }
        return {
          supported: true,
          text: new TextDecoder().decode(output),
        };
      } catch (error) {
        return {
          supported: false,
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    });

    expect(result).toEqual({ supported: true, text: 'hello' });
  });
});
