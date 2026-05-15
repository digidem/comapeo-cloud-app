import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('deployment.config.json', () => {
  const configPath = resolve(__dirname, '../../../deployment.config.json');

  it('exists and is valid JSON', () => {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(config).toBeDefined();
  });

  it('has required fields', () => {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));

    expect(config).toHaveProperty('cloudflareProjectName');
    expect(config).toHaveProperty('productionOrigin');
    expect(config).toHaveProperty('finalProductionOrigin');
    expect(config).toHaveProperty('stagingBranch');
  });

  it('productionOrigin is a valid HTTPS URL without trailing slash', () => {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    const { productionOrigin } = config;

    expect(productionOrigin).toMatch(/^https:\/\//);
    expect(productionOrigin).not.toMatch(/\/$/);
  });

  it('finalProductionOrigin is a valid HTTPS URL without trailing slash', () => {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    const { finalProductionOrigin } = config;

    expect(finalProductionOrigin).toMatch(/^https:\/\//);
    expect(finalProductionOrigin).not.toMatch(/\/$/);
  });

  it('cloudflareProjectName is non-empty', () => {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(config.cloudflareProjectName).toBeTruthy();
  });

  it('stagingBranch is a non-empty string', () => {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(config.stagingBranch).toBeTruthy();
    expect(typeof config.stagingBranch).toBe('string');
  });
});
