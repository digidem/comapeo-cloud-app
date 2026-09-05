import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  type SentryCliRunner,
  buildSentryCliSteps,
  executeSentryCliSteps,
} from '../../../scripts/lib/sentry-cli';

const params = {
  org: 'org-1',
  project: 'project-1',
  release: 'release-1',
  distDir: '/abs/path/dist',
};

describe('buildSentryCliSteps', () => {
  it('injects debug IDs before uploading source maps', () => {
    const steps = buildSentryCliSteps(params);
    const names = steps.map((step) => step.name);

    expect(names.indexOf('sourcemaps inject')).toBeGreaterThanOrEqual(0);
    expect(names.indexOf('sourcemaps upload')).toBe(
      names.indexOf('sourcemaps inject') + 1,
    );
    expect(names).toEqual([
      'sourcemaps inject',
      'sourcemaps upload',
      'releases finalize',
      'releases set-commits',
    ]);
  });

  it('points inject and upload at the dist directory and scopes upload to the release', () => {
    const steps = buildSentryCliSteps(params);
    const [inject, upload] = steps;

    expect(inject?.args).toEqual([
      'sentry-cli',
      'sourcemaps',
      'inject',
      params.distDir,
    ]);
    expect(upload?.args).toEqual([
      'sentry-cli',
      'sourcemaps',
      'upload',
      '--org',
      params.org,
      '--project',
      params.project,
      '--release',
      params.release,
      params.distDir,
    ]);
  });

  it('finalizes the release and sets commits after the upload succeeds', () => {
    const steps = buildSentryCliSteps(params);
    const uploadIndex = steps.findIndex(
      (step) => step.name === 'sourcemaps upload',
    );

    expect(steps.slice(uploadIndex + 1).map((step) => step.args)).toEqual([
      ['sentry-cli', 'releases', 'finalize', params.release],
      [
        'sentry-cli',
        'releases',
        'set-commits',
        params.release,
        '--auto',
        '--ignore-missing',
      ],
    ]);
  });

  it('keeps inject and upload required and release attribution best effort', () => {
    const steps = buildSentryCliSteps(params);

    expect(
      Object.fromEntries(steps.map((step) => [step.name, step.bestEffort])),
    ).toEqual({
      'sourcemaps inject': false,
      'sourcemaps upload': false,
      'releases finalize': true,
      'releases set-commits': true,
    });
  });
});

describe('executeSentryCliSteps', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs every step in order and exits 0 when all succeed', () => {
    const steps = buildSentryCliSteps(params);
    const ran: string[] = [];
    const run: SentryCliRunner = (args) => {
      ran.push(String(args[2]));
    };

    const result = executeSentryCliSteps(steps, run);

    expect(ran).toEqual(['inject', 'upload', 'finalize', 'set-commits']);
    expect(result.exitCode).toBe(0);
    expect(result.failedStep).toBeNull();
  });

  it('exits 1 and stops the pipeline when inject fails', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const steps = buildSentryCliSteps(params);
    const ran: string[] = [];
    const run: SentryCliRunner = (args) => {
      ran.push(String(args[2]));
      if (args[2] === 'inject') throw new Error('inject failed');
    };

    const result = executeSentryCliSteps(steps, run);

    expect(ran).toEqual(['inject']);
    expect(result.failedStep).toBe('sourcemaps inject');
    expect(result.exitCode).toBe(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it('exits 1 when the upload fails and skips release attribution', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const steps = buildSentryCliSteps(params);
    const ran: string[] = [];
    const run: SentryCliRunner = (args) => {
      ran.push(String(args[2]));
      if (args[2] === 'upload') throw new Error('upload failed');
    };

    const result = executeSentryCliSteps(steps, run);

    expect(ran).toEqual(['inject', 'upload']);
    expect(result.failedStep).toBe('sourcemaps upload');
    expect(result.exitCode).toBe(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it('logs a warning and still exits 0 when set-commits fails', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const steps = buildSentryCliSteps(params);
    const ran: string[] = [];
    const run: SentryCliRunner = (args) => {
      ran.push(String(args[2]));
      if (args[2] === 'set-commits') throw new Error('set-commits failed');
    };

    const result = executeSentryCliSteps(steps, run);

    expect(ran).toEqual(['inject', 'upload', 'finalize', 'set-commits']);
    expect(result.failedStep).toBeNull();
    expect(result.exitCode).toBe(0);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('releases set-commits'),
      expect.any(Error),
    );
    expect(error).not.toHaveBeenCalled();
  });
});

describe('upload-sourcemaps wiring', () => {
  const source = readFileSync(
    resolve(__dirname, '../../../scripts/upload-sourcemaps.ts'),
    'utf8',
  );

  it('runs the shared cli steps and exits non-zero only when a required step fails', () => {
    expect(source).toContain('buildSentryCliSteps(');
    expect(source).toContain('executeSentryCliSteps(');
    expect(source).toMatch(/exitCode\s*!==\s*0/);
    expect(source).toMatch(/process\.exit\(result\.exitCode\)/);
  });
});
