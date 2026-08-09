import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  assertReconciliableReport,
  buildIssuePlan,
  extractDiagnostics,
  groupDiagnosticsByFile,
  issueMarkerForFile,
  retryDelayMs,
} from '../../../scripts/react-doctor-audit';

const rootDir = process.cwd();

const diagnostic = {
  filePath: 'src/components/Foo.tsx',
  plugin: 'react-doctor',
  rule: 'no-array-index-as-key',
  severity: 'warning',
  title: 'Array index used as a key',
  message: 'Use a stable key.',
  help: 'Use a stable id from the item.',
  line: 42,
  column: 7,
  id: 'foo-diagnostic',
};

describe('react-doctor weekly audit', () => {
  it('extracts and de-duplicates diagnostics from complete schema v3 reports', () => {
    const report = {
      schemaVersion: 3,
      ok: true,
      reactDetected: true,
      projects: [{ complete: true, diagnostics: [diagnostic] }],
      diagnostics: [diagnostic],
    };

    expect(() => assertReconciliableReport(report)).not.toThrow();
    expect(extractDiagnostics(report)).toEqual([diagnostic]);
  });

  it('accepts the legacy top-level diagnostics shape from the issue draft', () => {
    expect(extractDiagnostics({ diagnostics: [diagnostic] })).toEqual([
      diagnostic,
    ]);
  });

  it('refuses to reconcile failed, partial, or unrecognized scans', () => {
    expect(() => assertReconciliableReport({ ok: false })).toThrow(
      'React Doctor report is not safe to reconcile',
    );
    expect(() => assertReconciliableReport({})).toThrow(
      'React Doctor report is not safe to reconcile',
    );
    expect(() => assertReconciliableReport({ diagnostics: [] })).toThrow(
      'React Doctor report is not safe to reconcile',
    );
    expect(() =>
      assertReconciliableReport({
        schemaVersion: 4,
        ok: true,
        reactDetected: true,
        projects: [{ complete: true, diagnostics: [] }],
        diagnostics: [],
      }),
    ).toThrow('React Doctor report is not safe to reconcile');
    expect(() =>
      assertReconciliableReport({
        schemaVersion: 3,
        ok: true,
        reactDetected: true,
        projects: [{ complete: false, diagnostics: [] }],
        diagnostics: [],
      }),
    ).toThrow('React Doctor report is not safe to reconcile');
  });

  it('batches findings by file', () => {
    const second = {
      ...diagnostic,
      rule: 'prefer-html-dialog',
      line: 50,
      id: 'foo-dialog',
    };

    const groups = groupDiagnosticsByFile([diagnostic, second]);
    expect(groups.get('src/components/Foo.tsx')).toEqual([diagnostic, second]);
  });

  it('does not collapse the same diagnostic id across different locations', () => {
    const second = {
      ...diagnostic,
      filePath: 'src/components/Bar.tsx',
      normalizedFilePath: 'src/components/Bar.tsx',
    };
    const report = { diagnostics: [diagnostic, second] };

    expect(extractDiagnostics(report)).toHaveLength(2);
  });

  it('does not mutate an unchanged tracked issue on a later weekly run', () => {
    const groups = groupDiagnosticsByFile([diagnostic]);
    const firstPlan = buildIssuePlan({
      groups,
      existingIssues: [],
      maxNewIssues: 10,
    });
    const created = firstPlan.create[0];
    if (!created) throw new Error('Expected the first run to create an issue');

    const secondPlan = buildIssuePlan({
      groups,
      existingIssues: [
        {
          number: 10,
          title: created.title,
          body: created.body,
          labels: created.labels.map((name) => ({ name })),
        },
      ],
      maxNewIssues: 10,
    });

    expect(secondPlan.create).toHaveLength(0);
    expect(secondPlan.update).toHaveLength(0);
    expect(secondPlan.close).toHaveLength(0);
  });

  it('creates, updates, and closes tracked file issues without duplicates', () => {
    const groups = groupDiagnosticsByFile([diagnostic]);
    const existing = [
      {
        number: 10,
        title: '[react-doctor] old title',
        body: `${issueMarkerForFile('src/components/Foo.tsx')}\nold body`,
        labels: [{ name: 'react-doctor' }],
      },
      {
        number: 11,
        title: '[react-doctor] resolved file',
        body: `${issueMarkerForFile('src/components/Resolved.tsx')}\nold body`,
        labels: [{ name: 'react-doctor' }],
      },
    ];

    const plan = buildIssuePlan({
      groups,
      existingIssues: existing,
      maxNewIssues: 10,
    });

    expect(plan.create).toHaveLength(0);
    expect(plan.update.map((item) => item.number)).toEqual([10]);
    expect(plan.close.map((item) => item.number)).toEqual([11]);
    expect(plan.meta).toBeNull();
  });

  it('preserves human notes while updating an automated issue', () => {
    const groups = groupDiagnosticsByFile([diagnostic]);
    const firstPlan = buildIssuePlan({
      groups,
      existingIssues: [],
    });
    const created = firstPlan.create[0];
    if (!created) throw new Error('Expected an issue draft');

    const changed = { ...diagnostic, message: 'Updated scanner message.' };
    const plan = buildIssuePlan({
      groups: groupDiagnosticsByFile([changed]),
      existingIssues: [
        {
          number: 10,
          title: created.title,
          body: `${created.body}\nKeep this triage context.`,
          labels: created.labels.map((name) => ({ name })),
        },
      ],
    });

    expect(plan.update[0]?.body).toContain('Updated scanner message.');
    expect(plan.update[0]?.body).toContain('Keep this triage context.');
  });

  it('uses a single meta issue instead of flooding GitHub on a large audit', () => {
    const diagnostics = Array.from({ length: 50 }, (_, index) => ({
      ...diagnostic,
      filePath: `src/components/File${index}.tsx`,
      normalizedFilePath: `src/components/File${index}.tsx`,
      id: `diagnostic-${index}`,
      line: index + 1,
    }));

    const plan = buildIssuePlan({
      groups: groupDiagnosticsByFile(diagnostics),
      existingIssues: [],
      maxNewIssues: 10,
    });

    expect(plan.create).toHaveLength(10);
    expect(plan.meta?.action).toBe('create');
    if (plan.meta?.action !== 'create') {
      throw new Error('Expected a meta issue to be created');
    }
    expect(plan.meta.body).toContain('40 additional files');
  });

  it('self-heals duplicate tracked file issues', () => {
    const groups = groupDiagnosticsByFile([diagnostic]);
    const firstPlan = buildIssuePlan({ groups, existingIssues: [] });
    const created = firstPlan.create[0];
    if (!created) throw new Error('Expected an issue draft');

    const plan = buildIssuePlan({
      groups,
      existingIssues: [
        {
          number: 10,
          title: created.title,
          body: created.body,
          labels: created.labels.map((name) => ({ name })),
        },
        {
          number: 11,
          title: created.title,
          body: created.body,
          labels: created.labels.map((name) => ({ name })),
        },
      ],
    });

    expect(plan.update).toHaveLength(0);
    expect(plan.close).toEqual([{ number: 11 }]);
  });

  it('blocks an unexpectedly large set of destructive closures', () => {
    const existingIssues = Array.from({ length: 6 }, (_, index) => ({
      number: index + 1,
      title: `[react-doctor] old ${index}`,
      body: `${issueMarkerForFile(`src/components/Old${index}.tsx`)}\nold body`,
      labels: [{ name: 'react-doctor' }],
    }));

    const plan = buildIssuePlan({
      groups: new Map(),
      existingIssues,
    });

    expect(plan.close).toHaveLength(0);
    expect(plan.meta?.action).toBe('create');
    if (plan.meta?.action !== 'create') {
      throw new Error('Expected a safety meta issue');
    }
    expect(plan.meta.title).toContain('safety hold');
    expect(plan.meta.body).toContain('6 of 6 tracked file issues');
    expect(plan.meta.body).toContain('closures were skipped');
    expect(plan.meta.body).toContain('Blocked issues: #1, #2, #3, #4, #5, #6');
  });

  it('caps destructive closures even when they are below half the backlog', () => {
    const existingIssues = Array.from({ length: 100 }, (_, index) => ({
      number: index + 1,
      title: `[react-doctor] old ${index}`,
      body: `${issueMarkerForFile(`src/components/Old${index}.tsx`)}\nold body`,
      labels: [{ name: 'react-doctor' }],
    }));
    const remainingDiagnostics = Array.from({ length: 74 }, (_, index) => ({
      ...diagnostic,
      filePath: `src/components/Old${index + 26}.tsx`,
      normalizedFilePath: `src/components/Old${index + 26}.tsx`,
      id: `remaining-${index}`,
    }));

    const plan = buildIssuePlan({
      groups: groupDiagnosticsByFile(remainingDiagnostics),
      existingIssues,
    });

    expect(plan.close).toHaveLength(0);
    expect(plan.meta?.action).toBe('create');
    if (plan.meta?.action !== 'create') {
      throw new Error('Expected an absolute closure safety hold');
    }
    expect(plan.meta.title).toContain('26 closures blocked');
    expect(plan.meta.body).toContain('safety limit of 25');
  });

  it('closes an obsolete meta issue when no guard or overflow remains', () => {
    const plan = buildIssuePlan({
      groups: new Map(),
      existingIssues: [
        {
          number: 99,
          title: '[react-doctor] old meta',
          body: '<!-- react-doctor:meta -->\nold body',
          labels: [{ name: 'react-doctor' }],
        },
      ],
    });

    expect(plan.meta).toEqual({ action: 'close', number: 99 });
  });

  it('does not retry ambiguous failed issue creation requests', () => {
    expect(
      retryDelayMs(new Response(null, { status: 502 }), 0, 'POST'),
    ).toBeNull();
    expect(retryDelayMs(new Response(null, { status: 502 }), 0, 'GET')).toBe(
      1000,
    );
    expect(
      retryDelayMs(
        new Response(null, {
          status: 429,
          headers: { 'retry-after': '2' },
        }),
        0,
        'POST',
      ),
    ).toBe(2000);
  });

  it('keeps the PR gate advisory and the weekly audit scheduled', () => {
    const prWorkflow = readFileSync(
      path.join(rootDir, '.github/workflows/react-doctor.yml'),
      'utf8',
    );
    const auditWorkflow = readFileSync(
      path.join(rootDir, '.github/workflows/react-doctor-audit.yml'),
      'utf8',
    );

    expect(prWorkflow).toContain(
      'millionco/react-doctor@01820bb4fd4d0a4aebcd8df2b2a143a098649cb2',
    );
    expect(prWorkflow).toContain('blocking: none');
    expect(prWorkflow).toContain('scope: changed');
    expect(prWorkflow).toContain('fetch-depth: 0');
    expect(prWorkflow).toContain('persist-credentials: false');
    expect(prWorkflow).toContain('statuses: write');
    expect(prWorkflow).not.toContain('issues: write');
    expect(prWorkflow).toContain('head.repo.fork');

    expect(auditWorkflow).toContain("cron: '0 6 * * 1'");
    expect(auditWorkflow).toContain('pull_request:');
    expect(auditWorkflow).toContain('issues: write');
    expect(auditWorkflow).toContain('react-doctor@0.9.11');
    expect(auditWorkflow).toContain('--scope full');
    expect(auditWorkflow).toContain('react-doctor-report.json');
    expect(auditWorkflow).toContain('--dry-run');
    expect(auditWorkflow).toContain('persist-credentials: false');
    expect(auditWorkflow).toContain(
      'tsx@4.23.11 scripts/react-doctor-audit.ts',
    );
  });
});
