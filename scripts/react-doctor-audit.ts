import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export type ReactDoctorDiagnostic = {
  id?: string;
  file?: string;
  filePath?: string;
  normalizedFilePath?: string;
  plugin?: string;
  rule?: string;
  severity?: string;
  title?: string;
  message?: string;
  help?: string;
  docsUrl?: string;
  line?: number;
  column?: number;
};

type ExistingIssue = {
  number: number;
  title: string;
  body: string | null;
  labels: Array<{ name?: string } | string>;
  pull_request?: unknown;
};

type IssueDraft = {
  title: string;
  body: string;
  labels: string[];
};

type IssueUpdate = IssueDraft & { number: number };

type MetaChange =
  | ({ action: 'create' } & IssueDraft)
  | ({ action: 'update'; number: number } & IssueDraft)
  | { action: 'close'; number: number };

export type IssuePlan = {
  create: IssueDraft[];
  update: IssueUpdate[];
  close: Array<{ number: number }>;
  meta: MetaChange | null;
};

const FILE_MARKER_PREFIX = '<!-- react-doctor:file=';
const META_MARKER = '<!-- react-doctor:meta -->';
const BASE_LABELS = ['react-doctor', 'tech-debt'];

const LABEL_DEFINITIONS = [
  {
    name: 'react-doctor',
    color: '5B47E0',
    description: 'Tracked by the scheduled React Doctor audit',
  },
  {
    name: 'tech-debt',
    color: 'D4C5F9',
    description: 'Technical debt identified for follow-up',
  },
  {
    name: 'severity:error',
    color: 'B60205',
    description: 'React Doctor error-severity finding',
  },
  {
    name: 'severity:warning',
    color: 'FBCA04',
    description: 'React Doctor warning-severity finding',
  },
];

function diagnosticFile(diagnostic: ReactDoctorDiagnostic): string | null {
  return (
    diagnostic.normalizedFilePath ??
    diagnostic.filePath ??
    diagnostic.file ??
    null
  );
}

function diagnosticKey(diagnostic: ReactDoctorDiagnostic): string {
  return (
    diagnostic.id ??
    [
      diagnosticFile(diagnostic),
      diagnostic.line ?? 0,
      diagnostic.column ?? 0,
      diagnostic.plugin ?? 'react-doctor',
      diagnostic.rule ?? 'unknown-rule',
      diagnostic.message ?? '',
    ].join('::')
  );
}

export function assertReconciliableReport(report: unknown): void {
  if (!report || typeof report !== 'object') {
    throw new Error(
      'React Doctor report is not safe to reconcile: invalid JSON',
    );
  }

  const value = report as {
    ok?: boolean;
    reactDetected?: boolean;
    projects?: Array<{ complete?: boolean }>;
  };
  const hasPartialProject = value.projects?.some(
    (project) => project.complete === false,
  );

  if (
    value.ok === false ||
    value.reactDetected === false ||
    hasPartialProject === true
  ) {
    throw new Error(
      'React Doctor report is not safe to reconcile: scan failed or was incomplete',
    );
  }
}

export function extractDiagnostics(report: unknown): ReactDoctorDiagnostic[] {
  if (!report || typeof report !== 'object') return [];

  const value = report as {
    diagnostics?: unknown;
    projects?: Array<{ diagnostics?: unknown }>;
  };
  const candidates: ReactDoctorDiagnostic[] = [];

  if (Array.isArray(value.diagnostics)) {
    candidates.push(...(value.diagnostics as ReactDoctorDiagnostic[]));
  }

  for (const project of value.projects ?? []) {
    if (Array.isArray(project?.diagnostics)) {
      candidates.push(...(project.diagnostics as ReactDoctorDiagnostic[]));
    }
  }

  const unique = new Map<string, ReactDoctorDiagnostic>();
  for (const diagnostic of candidates) {
    if (!diagnosticFile(diagnostic)) continue;
    unique.set(diagnosticKey(diagnostic), diagnostic);
  }

  return [...unique.values()];
}

export function groupDiagnosticsByFile(
  diagnostics: ReactDoctorDiagnostic[],
): Map<string, ReactDoctorDiagnostic[]> {
  const groups = new Map<string, ReactDoctorDiagnostic[]>();

  for (const diagnostic of diagnostics) {
    const file = diagnosticFile(diagnostic);
    if (!file) continue;
    const current = groups.get(file) ?? [];
    current.push(diagnostic);
    groups.set(file, current);
  }

  for (const findings of groups.values()) {
    findings.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
  }

  return groups;
}

export function issueMarkerForFile(file: string): string {
  return `${FILE_MARKER_PREFIX}${encodeURIComponent(file)} -->`;
}

function fileFromIssueMarker(body: string | null): string | null {
  if (!body) return null;
  const match = body.match(/<!-- react-doctor:file=([^ ]+) -->/);
  if (!match?.[1]) return null;

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

function docsUrl(diagnostic: ReactDoctorDiagnostic): string | null {
  if (diagnostic.docsUrl) return diagnostic.docsUrl;
  if (diagnostic.plugin === 'react-doctor' && diagnostic.rule) {
    return `https://react.doctor/rules/${diagnostic.rule}`;
  }
  return null;
}

function severityLabel(findings: ReactDoctorDiagnostic[]): string {
  if (findings.some((finding) => finding.severity === 'error')) {
    return 'severity:error';
  }
  return 'severity:warning';
}

function issueTitle(file: string, findings: ReactDoctorDiagnostic[]): string {
  const only = findings[0];
  if (findings.length === 1 && only) {
    const rule = only.rule ?? only.id ?? 'finding';
    const location = only.line ? `:${only.line}` : '';
    return `[react-doctor] ${rule} · ${file}${location}`;
  }
  return `[react-doctor] ${file} (${findings.length} findings)`;
}

function issueBody(file: string, findings: ReactDoctorDiagnostic[]): string {
  const rows = findings.map((finding) => {
    const rule = finding.rule ?? finding.id ?? 'unknown-rule';
    const location = finding.line
      ? `L${finding.line}${finding.column ? `:${finding.column}` : ''}`
      : 'file-level';
    const message = finding.message ?? finding.title ?? 'No message provided.';
    const help = finding.help ? `\n  - Fix: ${finding.help}` : '';
    const docs = docsUrl(finding);
    const docsLine = docs ? `\n  - Docs: ${docs}` : '';
    return `- **${rule}** (${finding.severity ?? 'warning'}, ${location}) — ${message}${help}${docsLine}`;
  });

  return [
    issueMarkerForFile(file),
    `React Doctor currently reports **${findings.length} finding${findings.length === 1 ? '' : 's'}** in \`${file}\`.`,
    '',
    ...rows,
    '',
    '_This issue is maintained automatically. It will be updated while findings remain and closed when the file is clean._',
  ].join('\n');
}

function metaBody(
  groups: Map<string, ReactDoctorDiagnostic[]>,
  totalFindings: number,
  reason: string,
): string {
  const summary = [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .slice(0, 20)
    .map(([file, findings]) => `- \`${file}\`: ${findings.length}`);

  return [
    META_MARKER,
    `React Doctor reports **${totalFindings} findings** across **${groups.size} files**.`,
    '',
    reason,
    '',
    'Top affected files:',
    ...summary,
    '',
    '_The latest complete JSON report is retained as an artifact of the React Doctor Weekly Audit workflow._',
    '',
    '_This meta-issue is maintained automatically and closes once the audit can return to normal per-file tracking._',
  ].join('\n');
}

function makeDraft(
  file: string,
  findings: ReactDoctorDiagnostic[],
): IssueDraft {
  return {
    title: issueTitle(file, findings),
    body: issueBody(file, findings),
    labels: [...BASE_LABELS, severityLabel(findings)],
  };
}

function labelNames(issue: ExistingIssue): string[] {
  return issue.labels
    .map((label) => (typeof label === 'string' ? label : label.name))
    .filter((name): name is string => Boolean(name));
}

function labelsWithManagedState(
  issue: ExistingIssue,
  desired: string[],
): string[] {
  const managed = new Set([
    ...BASE_LABELS,
    'severity:error',
    'severity:warning',
  ]);
  const unmanaged = labelNames(issue).filter((name) => !managed.has(name));
  return [...unmanaged, ...desired];
}

function issueMatchesDraft(issue: ExistingIssue, draft: IssueDraft): boolean {
  const actualLabels = [...labelNames(issue)].sort();
  const desiredLabels = [...labelsWithManagedState(issue, draft.labels)].sort();
  return (
    issue.title === draft.title &&
    issue.body === draft.body &&
    actualLabels.join('\n') === desiredLabels.join('\n')
  );
}

export function buildIssuePlan({
  groups,
  existingIssues,
  maxNewIssues = 10,
  metaThreshold = 50,
}: {
  groups: Map<string, ReactDoctorDiagnostic[]>;
  existingIssues: ExistingIssue[];
  runUrl: string;
  maxNewIssues?: number;
  metaThreshold?: number;
}): IssuePlan {
  const trackedIssues = existingIssues.filter((issue) => !issue.pull_request);
  const existingMeta = trackedIssues.find((issue) =>
    issue.body?.includes(META_MARKER),
  );
  const existingByFile = new Map<string, ExistingIssue>();

  for (const issue of trackedIssues) {
    const file = fileFromIssueMarker(issue.body);
    if (file && !existingByFile.has(file)) existingByFile.set(file, issue);
  }

  const update: IssueUpdate[] = [];
  const close: Array<{ number: number }> = [];

  for (const [file, issue] of existingByFile) {
    const findings = groups.get(file);
    if (findings?.length) {
      const draft = makeDraft(file, findings);
      if (!issueMatchesDraft(issue, draft)) {
        update.push({
          number: issue.number,
          ...draft,
          labels: labelsWithManagedState(issue, draft.labels),
        });
      }
    } else {
      close.push({ number: issue.number });
    }
  }

  const newGroups = [...groups.entries()].filter(
    ([file]) => !existingByFile.has(file),
  );
  const totalFindings = [...groups.values()].reduce(
    (sum, findings) => sum + findings.length,
    0,
  );

  if (totalFindings >= metaThreshold) {
    const draft: IssueDraft = {
      title: `[react-doctor] Weekly audit backlog (${totalFindings} findings)`,
      body: metaBody(
        groups,
        totalFindings,
        `The backlog exceeds the ${metaThreshold}-finding flood-control threshold, so new per-file issues are paused for this run.`,
      ),
      labels: [...BASE_LABELS, severityLabel([...groups.values()].flat())],
    };
    const meta: MetaChange | null = existingMeta
      ? issueMatchesDraft(existingMeta, draft)
        ? null
        : {
            action: 'update',
            number: existingMeta.number,
            ...draft,
            labels: labelsWithManagedState(existingMeta, draft.labels),
          }
      : { action: 'create', ...draft };
    return { create: [], update, close, meta };
  }

  const create = newGroups
    .slice(0, maxNewIssues)
    .map(([file, findings]) => makeDraft(file, findings));
  const overflow = newGroups.length - create.length;

  let meta: MetaChange | null = null;
  if (overflow > 0) {
    const draft: IssueDraft = {
      title: `[react-doctor] Weekly audit overflow (${overflow} files queued)`,
      body: metaBody(
        groups,
        totalFindings,
        `This run created at most ${maxNewIssues} new per-file issues. **${overflow} additional files** remain queued to avoid flooding GitHub.`,
      ),
      labels: [...BASE_LABELS, severityLabel([...groups.values()].flat())],
    };
    meta = existingMeta
      ? issueMatchesDraft(existingMeta, draft)
        ? null
        : {
            action: 'update',
            number: existingMeta.number,
            ...draft,
            labels: labelsWithManagedState(existingMeta, draft.labels),
          }
      : { action: 'create', ...draft };
  } else if (existingMeta) {
    meta = { action: 'close', number: existingMeta.number };
  }

  return { create, update, close, meta };
}

async function githubRequest<T>(
  repo: string,
  token: string,
  endpoint: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(
    `https://api.github.com/repos/${repo}${endpoint}`,
    {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        ...init.headers,
      },
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `GitHub API ${init.method ?? 'GET'} ${endpoint} failed (${response.status}): ${text}`,
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function listTrackedIssues(
  repo: string,
  token: string,
): Promise<ExistingIssue[]> {
  const issues: ExistingIssue[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const batch = await githubRequest<ExistingIssue[]>(
      repo,
      token,
      `/issues?state=open&labels=react-doctor&per_page=100&page=${page}`,
    );
    issues.push(...batch.filter((issue) => !issue.pull_request));
    if (batch.length < 100) break;
  }
  return issues;
}

async function ensureLabels(repo: string, token: string): Promise<void> {
  const existing = await githubRequest<Array<{ name: string }>>(
    repo,
    token,
    '/labels?per_page=100',
  );
  const names = new Set(existing.map((label) => label.name));

  for (const label of LABEL_DEFINITIONS) {
    if (names.has(label.name)) continue;
    await githubRequest(repo, token, '/labels', {
      method: 'POST',
      body: JSON.stringify(label),
    });
  }
}

async function applyPlan(
  repo: string,
  token: string,
  plan: IssuePlan,
): Promise<void> {
  for (const issue of plan.update) {
    await githubRequest(repo, token, `/issues/${issue.number}`, {
      method: 'PATCH',
      body: JSON.stringify({
        title: issue.title,
        body: issue.body,
        labels: issue.labels,
      }),
    });
  }

  for (const issue of plan.close) {
    await githubRequest(repo, token, `/issues/${issue.number}`, {
      method: 'PATCH',
      body: JSON.stringify({ state: 'closed', state_reason: 'completed' }),
    });
  }

  for (const issue of plan.create) {
    await githubRequest(repo, token, '/issues', {
      method: 'POST',
      body: JSON.stringify(issue),
    });
  }

  if (!plan.meta) return;
  if (plan.meta.action === 'create') {
    await githubRequest(repo, token, '/issues', {
      method: 'POST',
      body: JSON.stringify({
        title: plan.meta.title,
        body: plan.meta.body,
        labels: plan.meta.labels,
      }),
    });
  } else if (plan.meta.action === 'update') {
    await githubRequest(repo, token, `/issues/${plan.meta.number}`, {
      method: 'PATCH',
      body: JSON.stringify({
        title: plan.meta.title,
        body: plan.meta.body,
        labels: plan.meta.labels,
      }),
    });
  } else {
    await githubRequest(repo, token, `/issues/${plan.meta.number}`, {
      method: 'PATCH',
      body: JSON.stringify({ state: 'closed', state_reason: 'completed' }),
    });
  }
}

async function main(): Promise<void> {
  const reportPath = process.argv[2] ?? 'react-doctor-report.json';
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  const runId = process.env.GITHUB_RUN_ID;

  if (!repo) throw new Error('GITHUB_REPOSITORY is required');
  if (!token) throw new Error('GITHUB_TOKEN or GH_TOKEN is required');

  const report = JSON.parse(await readFile(reportPath, 'utf8')) as unknown;
  assertReconciliableReport(report);
  const diagnostics = extractDiagnostics(report);
  const groups = groupDiagnosticsByFile(diagnostics);
  const runUrl = runId
    ? `https://github.com/${repo}/actions/runs/${runId}`
    : `https://github.com/${repo}/actions`;

  await ensureLabels(repo, token);
  const existingIssues = await listTrackedIssues(repo, token);
  const plan = buildIssuePlan({ groups, existingIssues, runUrl });
  await applyPlan(repo, token, plan);

  console.log(
    `React Doctor audit reconciled ${diagnostics.length} findings across ${groups.size} files: ${plan.create.length} created, ${plan.update.length} updated, ${plan.close.length} closed${plan.meta ? `, meta ${plan.meta.action}` : ''}.`,
  );
}

const entrypoint = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;
if (entrypoint === import.meta.url) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
