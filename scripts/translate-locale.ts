#!/usr/bin/env npx tsx
/**
 * LLM Translation Script for CoMapeo Cloud i18n
 *
 * Translates en.json (formatjs-extracted format) into a target locale
 * using an OpenAI-compatible API. Outputs flat JSON { key: "translated" }.
 *
 * Usage:
 *   npx tsx scripts/translate-locale.ts <lang> [model]
 *
 * Examples:
 *   npx tsx scripts/translate-locale.ts fr
 *   npx tsx scripts/translate-locale.ts sw gpt-4o
 *
 * Env vars:
 *   OPENAI_API_KEY       — API key for the LLM provider (required)
 *   TRANSLATE_API_URL    — Override for the API endpoint (default: https://api.openai.com/v1/chat/completions)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, '..');
const SRC_DIR = resolve(ROOT_DIR, 'src');
const MESSAGES_DIR = resolve(SRC_DIR, 'i18n', 'messages');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function e(msg: string): void {
  process.stderr.write(msg + '\n');
}

function exit(msg: string, code = 1): never {
  e(msg);
  process.exit(code);
}

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const lang = process.argv[2];
const model = process.argv[3] ?? 'gpt-4o';

if (!lang) {
  exit('Usage: npx tsx scripts/translate-locale.ts <lang> [model]');
}

if (!/^[a-z]{2,3}(-[A-Z]{2})?$/.test(lang)) {
  exit(
    `Invalid language code "${lang}". Expected format like "fr", "pt", "sw", or "zh-CN".`,
  );
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const sourcePath = resolve(MESSAGES_DIR, 'en.json');
const targetPath = resolve(MESSAGES_DIR, `${lang}.json`);

if (!existsSync(sourcePath)) {
  exit(`Source file not found: ${sourcePath}`);
}

// ---------------------------------------------------------------------------
// Load source messages (formatjs-extracted format)
// ---------------------------------------------------------------------------

e(`Loading source messages from en.json …`);

const rawSource = JSON.parse(readFileSync(sourcePath, 'utf-8')) as Record<
  string,
  { defaultMessage: string }
>;

const sourceEntries = Object.entries(rawSource);
const totalKeys = sourceEntries.length;

e(`Found ${totalKeys} message keys in en.json`);

// ---------------------------------------------------------------------------
// API setup
// ---------------------------------------------------------------------------

const API_URL =
  process.env['TRANSLATE_API_URL'] ??
  'https://api.openai.com/v1/chat/completions';
const API_KEY = process.env['OPENAI_API_KEY'];

if (!API_KEY) {
  exit(
    'OPENAI_API_KEY environment variable is required.\n' +
      'Set it via: export OPENAI_API_KEY="sk-…"',
  );
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a professional translator working on CoMapeo Cloud, a web dashboard used by environmental monitoring teams coordinating rangers and uploading field data.

Your task is to translate JSON message keys from English to the target language.

Rules:
1. Preserve all JSON keys exactly — do not modify, add, or remove any keys.
2. Output ONLY valid JSON with the same keys and translated values.
3. Keep ICU message syntax variables UNCHANGED — variables like {count}, {name}, {projectCount}, and ICU plural/select blocks like {count, plural, one {...} other {...}} must be preserved verbatim.
4. Use formal but clear technical language appropriate for a professional dashboard.
5. Translate the defaultMessage values, not the keys.

Output ONLY the JSON object — no explanations, no markdown, no code fences.`;

// ---------------------------------------------------------------------------
// Translation helper
// ---------------------------------------------------------------------------

const CHUNK_SIZE = 50;
const MAX_RETRIES = 3;

interface ApiResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

async function translateChunk(
  chunk: [string, { defaultMessage: string }][],
): Promise<Record<string, string> | null> {
  // Build a reduced JSON object for the LLM with just the keys from this chunk
  const sourceObj: Record<string, string> = {};
  for (const [key, value] of chunk) {
    sourceObj[key] = value.defaultMessage;
  }

  const payload = JSON.stringify(sourceObj, null, 2);

  const body = JSON.stringify({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Translate the following JSON messages to ${lang}. Preserve all keys exactly. Output only the JSON object:\n\n${payload}`,
      },
    ],
    temperature: 0.3,
    response_format: { type: 'json_object' },
  });

  let lastError: string | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${API_KEY}`,
        },
        body,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        lastError = `HTTP ${response.status}: ${errorText}`;
        if (attempt < MAX_RETRIES) {
          const delay = Math.pow(2, attempt) * 1000;
          e(
            `  API error (attempt ${attempt}/${MAX_RETRIES}), retrying in ${delay}ms …`,
          );
          await new Promise((r) => setTimeout(r, delay));
        }
        continue;
      }

      const data = (await response.json()) as ApiResponse;
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        lastError = 'Empty response from API';
        if (attempt < MAX_RETRIES) {
          const delay = Math.pow(2, attempt) * 1000;
          e(
            `  Empty response (attempt ${attempt}/${MAX_RETRIES}), retrying in ${delay}ms …`,
          );
          await new Promise((r) => setTimeout(r, delay));
        }
        continue;
      }

      // Clean the response: remove markdown fences if present
      let cleaned = content.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned
          .replace(/^```(?:json)?\s*\n?/, '')
          .replace(/\n?```\s*$/, '');
      }

      const parsed = JSON.parse(cleaned) as Record<string, unknown>;

      // Validate that all keys from the chunk are present
      const result: Record<string, string> = {};
      for (const [key] of chunk) {
        const val = parsed[key];
        if (typeof val === 'string') {
          result[key] = val;
        } else {
          // Key missing or not a string — fall back to English
          result[key] = rawSource[key]?.defaultMessage ?? key;
        }
      }

      return result;
    } catch (err) {
      lastError = String(err);
      if (attempt < MAX_RETRIES) {
        const delay = Math.pow(2, attempt) * 1000;
        e(
          `  Network error (attempt ${attempt}/${MAX_RETRIES}), retrying in ${delay}ms …`,
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  e(`  Failed after ${MAX_RETRIES} attempts: ${lastError ?? 'Unknown error'}`);
  return null;
}

// ---------------------------------------------------------------------------
// Main translation loop
// ---------------------------------------------------------------------------

e(`Translating to "${lang}" using model "${model}" …`);
e(
  `Chunk size: ${CHUNK_SIZE}, ${Math.ceil(totalKeys / CHUNK_SIZE)} batch(es)\n`,
);

const translatedMessages: Record<string, string> = {};
let successCount = 0;
let fallbackCount = 0;

for (let i = 0; i < sourceEntries.length; i += CHUNK_SIZE) {
  const chunk = sourceEntries.slice(i, i + CHUNK_SIZE);
  const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
  const totalChunks = Math.ceil(sourceEntries.length / CHUNK_SIZE);

  e(`[${chunkNum}/${totalChunks}] Translating ${chunk.length} messages …`);

  const result = await translateChunk(chunk);

  if (result) {
    for (const [key, value] of Object.entries(result)) {
      translatedMessages[key] = value;
      successCount++;
    }
  } else {
    // Fall back to English for the entire chunk
    e(`  Batch failed, falling back to English for all ${chunk.length} keys`);
    for (const [key, value] of chunk) {
      translatedMessages[key] = value.defaultMessage;
      fallbackCount++;
    }
  }
}

// ---------------------------------------------------------------------------
// Verify we have all keys
// ---------------------------------------------------------------------------

const missingKeys = sourceEntries
  .map(([key]) => key)
  .filter((key) => !(key in translatedMessages));

if (missingKeys.length > 0) {
  e(
    `\nWarning: ${missingKeys.length} keys missing from translation output, falling back to English`,
  );
  for (const key of missingKeys) {
    translatedMessages[key] = rawSource[key]?.defaultMessage ?? key;
    fallbackCount++;
    successCount--;
  }
}

// ---------------------------------------------------------------------------
// Sort keys alphabetically for consistency
// ---------------------------------------------------------------------------

const sortedKeys = Object.keys(translatedMessages).sort();
const finalOutput: Record<string, string> = {};
for (const key of sortedKeys) {
  finalOutput[key] = translatedMessages[key]!;
}

// ---------------------------------------------------------------------------
// Validate JSON before writing
// ---------------------------------------------------------------------------

const jsonString = JSON.stringify(finalOutput, null, 2) + '\n';

try {
  JSON.parse(jsonString);
} catch (err) {
  exit(`Generated invalid JSON: ${err}`);
}

// ---------------------------------------------------------------------------
// Write output file
// ---------------------------------------------------------------------------

writeFileSync(targetPath, jsonString, 'utf-8');
e(`\nWrote ${targetPath}`);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const effectiveSuccess = successCount;
const effectiveFallback = fallbackCount + missingKeys.length;
const expected = totalKeys;

e(`\n=== Translation Summary ===`);
e(`  Total source keys: ${expected}`);
e(`  Translated:        ${effectiveSuccess}/${expected}`);
e(`  Fallback (English): ${effectiveFallback}`);
e(`  Output file:       ${targetPath}`);

if (effectiveSuccess === expected) {
  e('  Status: All keys translated successfully ✓');
} else {
  e('  Status: Partial completion — some keys use English fallback ⚠');
}

// ---------------------------------------------------------------------------
// Register the new locale in the codebase
// ---------------------------------------------------------------------------

e(`\nRegistering locale "${lang}" in the codebase …`);

// 1. load-messages.ts — add import
const loadMessagesPath = resolve(SRC_DIR, 'i18n', 'load-messages.ts');
let loadMessagesContent = readFileSync(loadMessagesPath, 'utf-8');

// Check if already registered
if (loadMessagesContent.includes(`'${lang}'`)) {
  e(`  Locale "${lang}" already registered in load-messages.ts, skipping`);
} else {
  // Add import line after the last existing import
  const importLine = `import ${lang}Messages from './messages/${lang}.json';`;
  if (!loadMessagesContent.includes(importLine)) {
    // Find the last import line and insert after it
    const lines = loadMessagesContent.split('\n');
    let lastImportIdx = -1;
    for (let idx = 0; idx < lines.length; idx++) {
      if (lines[idx]!.startsWith('import ')) {
        lastImportIdx = idx;
      }
    }
    if (lastImportIdx >= 0) {
      lines.splice(lastImportIdx + 1, 0, importLine);
    }
    loadMessagesContent = lines.join('\n');
  }

  // Add to MESSAGE_CACHE object
  const cacheEntry = `  ${lang}: ${lang}Messages as unknown as FlatMessages,`;
  if (!loadMessagesContent.includes(cacheEntry)) {
    // Find the last entry in MESSAGE_CACHE (before the closing })
    const cachePattern =
      /(\s+)(\w+): \w+Messages as unknown as FlatMessages,\s*$/m;
    const match = loadMessagesContent.match(cachePattern);
    if (match) {
      const lastCacheLine = match[0]!;
      loadMessagesContent = loadMessagesContent.replace(
        lastCacheLine,
        lastCacheLine + '\n' + cacheEntry,
      );
    }
  }

  // Add to SUPPORTED_LOCALES array
  const supportedLocalesPattern =
    /export const SUPPORTED_LOCALES: Locale\[\] = \[([^\]]+)\];/;
  const supportedMatch = loadMessagesContent.match(supportedLocalesPattern);
  if (supportedMatch) {
    const currentLocales = supportedMatch[1]!
      .split(',')
      .map((s) => s.trim().replace(/^'|'$/g, ''))
      .filter(Boolean);
    if (!currentLocales.includes(lang)) {
      currentLocales.push(lang);
      const newArray = currentLocales.map((l) => `'${l}'`).join(', ');
      loadMessagesContent = loadMessagesContent.replace(
        supportedLocalesPattern,
        `export const SUPPORTED_LOCALES: Locale[] = [${newArray}];`,
      );
    }
  }

  writeFileSync(loadMessagesPath, loadMessagesContent, 'utf-8');
  e(`  Updated ${loadMessagesPath}`);
}

// 2. locale-store.ts — update Locale type
const localeStorePath = resolve(SRC_DIR, 'stores', 'locale-store.ts');
let localeStoreContent = readFileSync(localeStorePath, 'utf-8');

const localeTypePattern = /export type Locale = '([^']+)'(?: \| '([^']+)')*;/;
const localeTypeMatch = localeStoreContent.match(localeTypePattern);

if (localeTypeMatch) {
  const currentTypes =
    localeStoreContent
      .match(/'[a-z]{2,3}(-[A-Z]{2})?'/g)
      ?.map((s) => s.replace(/'/g, '')) ?? [];
  if (!currentTypes.includes(lang)) {
    currentTypes.push(lang);
    const newType = currentTypes.map((l) => `'${l}'`).join(' | ');
    localeStoreContent = localeStoreContent.replace(
      localeTypePattern,
      `export type Locale = ${newType};`,
    );
    writeFileSync(localeStorePath, localeStoreContent, 'utf-8');
    e(`  Updated ${localeStorePath}`);
  } else {
    e(`  Locale "${lang}" already in Locale type, skipping`);
  }
}

// 3. language-selector.tsx — update LOCALE_NAMES
const languageSelectorPath = resolve(
  SRC_DIR,
  'components',
  'layout',
  'language-selector.tsx',
);
if (existsSync(languageSelectorPath)) {
  let selectorContent = readFileSync(languageSelectorPath, 'utf-8');

  // Check if already present
  const localeNamePattern = new RegExp(`('${lang}'\\s*:)`);
  if (!localeNamePattern.test(selectorContent)) {
    // Find the last entry in LOCALE_NAMES and add after it
    const lastEntryPattern = /(\s+)(\w+):\s*'[^']*',\s*$/m;
    const match = selectorContent.match(lastEntryPattern);
    if (match) {
      const displayName = lang.toUpperCase(); // Placeholder — user should customize
      const newEntry = `  ${lang}: '${displayName}',`;
      selectorContent = selectorContent.replace(
        match[0]!,
        match[0]! + '\n' + newEntry,
      );
      writeFileSync(languageSelectorPath, selectorContent, 'utf-8');
      e(
        `  Updated ${languageSelectorPath} (set display name to "${displayName}" — customize as needed)`,
      );
    } else {
      e(
        `  Warning: Could not find LOCALE_NAMES entries in ${languageSelectorPath}`,
      );
    }
  } else {
    e(`  Locale "${lang}" already in LOCALE_NAMES, skipping`);
  }
}

e(`\nDone! You can now import and use "${lang}" messages.`);
