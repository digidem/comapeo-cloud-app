/**
 * Build-time metadata generator.
 *
 * Reads `deployment.config.json` (or `VITE_PUBLIC_APP_ORIGIN` env override)
 * and generates `public/robots.txt` and `public/sitemap.xml` so the canonical
 * origin changes in one place.
 *
 * Usage:  npx tsx scripts/generate-metadata.ts
 *
 * The script exits with code 1 if the origin is missing, not HTTPS, or has
 * a trailing slash — preventing broken deploys early.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { DeploymentConfig } from './lib/metadata';
import {
  generateRobotsTxt,
  generateSitemapXml,
  validateOrigin,
} from './lib/metadata';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadConfig(rootDir: string): DeploymentConfig {
  const configPath = resolve(rootDir, 'deployment.config.json');
  return JSON.parse(readFileSync(configPath, 'utf-8')) as DeploymentConfig;
}

function getOrigin(rootDir: string): string {
  // Environment variable takes precedence (allows CI override without file edits)
  const envOrigin = process.env.VITE_PUBLIC_APP_ORIGIN;
  if (envOrigin) {
    return validateOrigin(envOrigin);
  }

  const config = loadConfig(rootDir);
  return validateOrigin(config.productionOrigin);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const rootDir = resolve(import.meta.dirname ?? '.', '..');
  const publicDir = resolve(rootDir, 'public');
  const origin = getOrigin(rootDir);

  console.log(`[generate-metadata] Using origin: ${origin}`);

  const robotsPath = resolve(publicDir, 'robots.txt');
  const sitemapPath = resolve(publicDir, 'sitemap.xml');

  writeFileSync(robotsPath, generateRobotsTxt(origin), 'utf-8');
  console.log(`[generate-metadata] Wrote ${robotsPath}`);

  writeFileSync(sitemapPath, generateSitemapXml(origin), 'utf-8');
  console.log(`[generate-metadata] Wrote ${sitemapPath}`);
}

main();
