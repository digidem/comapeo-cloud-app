/**
 * Ordered sentry-cli steps for the source-map deploy pipeline.
 *
 * Kept free of side effects so unit tests can assert step ordering and
 * failure semantics without spawning the CLI.
 */

export interface SentryCliStep {
  readonly name: string;
  readonly args: readonly string[];
  /**
   * Best-effort steps log a warning and let the deploy continue; required
   * steps stop the pipeline with a non-zero exit code.
   */
  readonly bestEffort: boolean;
}

export interface SentryCliStepsParams {
  readonly org: string;
  readonly project: string;
  readonly release: string;
  readonly distDir: string;
}

export type SentryCliRunner = (args: readonly string[]) => void;

export interface SentryCliRunResult {
  readonly failedStep: string | null;
  /** 0 when the pipeline completed, including best-effort failures. */
  readonly exitCode: 0 | 1;
}

/**
 * Inject, upload, then finalize the release with commit attribution.
 *
 * Debug-ID injection must precede the upload: `sourcemap: 'hidden'` builds
 * strip `//# sourceMappingURL` comments, so symbolication depends on the
 * debug IDs embedded in both the bundles and their maps.
 */
export function buildSentryCliSteps(
  params: SentryCliStepsParams,
): SentryCliStep[] {
  const { org, project, release, distDir } = params;

  return [
    {
      name: 'sourcemaps inject',
      args: ['sentry-cli', 'sourcemaps', 'inject', distDir],
      bestEffort: false,
    },
    {
      name: 'sourcemaps upload',
      args: [
        'sentry-cli',
        'sourcemaps',
        'upload',
        '--org',
        org,
        '--project',
        project,
        '--release',
        release,
        distDir,
      ],
      bestEffort: false,
    },
    {
      name: 'releases finalize',
      args: ['sentry-cli', 'releases', 'finalize', release],
      bestEffort: true,
    },
    {
      name: 'releases set-commits',
      args: [
        'sentry-cli',
        'releases',
        'set-commits',
        release,
        '--auto',
        '--ignore-missing',
      ],
      bestEffort: true,
    },
  ];
}

/** Runs steps in order and stops at the first required failure. */
export function executeSentryCliSteps(
  steps: readonly SentryCliStep[],
  run: SentryCliRunner,
): SentryCliRunResult {
  for (const step of steps) {
    console.log(`[upload-sourcemaps] Running sentry-cli ${step.name}...`);
    try {
      run(step.args);
    } catch (error) {
      if (!step.bestEffort) {
        console.error(
          `[upload-sourcemaps] sentry-cli ${step.name} failed:`,
          error,
        );
        return { failedStep: step.name, exitCode: 1 };
      }
      // Symbolication already succeeded; release attribution is best effort.
      console.warn(
        `[upload-sourcemaps] sentry-cli ${step.name} failed (continuing):`,
        error,
      );
    }
  }

  return { failedStep: null, exitCode: 0 };
}
