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
const HUMAN_NOTES_MARKER = '<!-- react-doctor:human-notes -->';
const AUTOMATION_FOOTER =
  '_This issue is maintained automatically. It will be updated while findings remain and closed when the file is clean._';
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
  return [
    diagnosticFile(diagnostic),
    diagnostic.line ?? 0,
    diagnostic.column ?? 0,
    diagnostic.plugin ?? 'react-doctor',
    diagnostic.rule ?? 'unknown-rule',
    diagnostic.id ?? '',
    diagnostic.message ?? '',
  ].join('::');
}

export function assertReconciliableReport(report: unknown): void {
  if (!report || typeof report !== 'object') {
    throw new Error(
      'React Doctor report is not safe to reconcile: invalid JSON',
    );
  }

  const value = report as {
    schemaVersion?: unknown;
    ok?: unknown;
    reactDetected?: unknown;
    diagnostics?: unknown;
    projects?: unknown;
  };

  const isCompleteSchemaV3Report =
    value.schemaVersion === 3 &&
    value.ok === true &&
    value.reactDetected === true &&
    Array.isArray(value.diagnostics) &&
    Array.isArray(value.projects) &&
    value.projects.length > 0 &&
    value.projects.every((project) => {
      if (!project || typeof project !== 'object') return false;
      const candidate = project as {
        complete?: unknown;
        diagnostics?: unknown;
      };
      return (
        candidate.complete === true && Array.isArray(candidate.diagnostics)
      );
    });

  if (!isCompleteSchemaV3Report) {
    throw new Error(
      'React Doctor report is not safe to reconcile: scan failed, was incomplete, or has an unrecognized schema',
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
    findings.sort(
      (a, b) =>
        (a.line ?? 0) - (b.line ?? 0) ||
        (a.column ?? 0) - (b.column ?? 0) ||
        (a.rule ?? a.id ?? '').localeCompare(b.rule ?? b.id ?? '') ||
        (a.message ?? a.title ?? '').localeCompare(
          b.message ?? b.title ?? '',
        ) ||
        (a.plugin ?? '').localeCompare(b.plugin ?? ''),
    );
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
    AUTOMATION_FOOTER,
    '',
    '_Human triage notes below this marker are preserved by the weekly audit._',
    HUMAN_NOTES_MARKER,
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
    '',
    '_Human triage notes below this marker are preserved by the weekly audit._',
    HUMAN_NOTES_MARKER,
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

function humanNotesFromBody(body: string | null): string {
  if (!body) return '';

  const markerIndex = body.indexOf(HUMAN_NOTES_MARKER);
  if (markerIndex >= 0) {
    return body.slice(markerIndex + HUMAN_NOTES_MARKER.length).trim();
  }

  const footerIndex = body.indexOf(AUTOMATION_FOOTER);
  if (footerIndex < 0) return '';
  return body.slice(footerIndex + AUTOMATION_FOOTER.length).trim();
}

function draftForExistingIssue(
  issue: ExistingIssue,
  draft: IssueDraft,
): IssueDraft {
  const humanNotes = humanNotesFromBody(issue.body);
  return {
    ...draft,
    body: humanNotes ? `${draft.body}\n${humanNotes}` : draft.body,
    labels: labelsWithManagedState(issue, draft.labels),
  };
}

function issueMatchesDraft(issue: ExistingIssue, draft: IssueDraft): boolean {
  const actualLabels = [...labelNames(issue)].sort();
  const desiredLabels = [...draft.labels].sort();
  return (
    issue.title === draft.title &&
    issue.body === draft.body &&
    actualLabels.join('\n') === desiredLabels.join('\n')
  );
}

function metaChangeForDraft(
  existingMeta: ExistingIssue | undefined,
  draft: IssueDraft,
): MetaChange | null {
  if (!existingMeta) return { action: 'create', ...draft };

  const existingDraft = draftForExistingIssue(existingMeta, draft);
  return issueMatchesDraft(existingMeta, existingDraft)
    ? null
    : { action: 'update', number: existingMeta.number, ...existingDraft };
}

export function buildIssuePlan({
  groups,
  existingIssues,
  maxNewIssues = 10,
}: {
  groups: Map<string, ReactDoctorDiagnostic[]>;
  existingIssues: ExistingIssue[];
  maxNewIssues?: number;
}): IssuePlan {
  const trackedIssues = existingIssues
    .filter((issue) => !issue.pull_request)
    .sort((a, b) => a.number - b.number);
  const existingMeta = trackedIssues.find(
    (issue) =>
      issue.body?.includes(META_MARKER) &&
      fileFromIssueMarker(issue.body) === null,
  );
  const existingByFile = new Map<string, ExistingIssue>();
  const duplicateClose: Array<{ number: number }> = [];

  for (const issue of trackedIssues) {
    const file = fileFromIssueMarker(issue.body);
    if (!file) continue;
    if (existingByFile.has(file)) {
      duplicateClose.push({ number: issue.number });
    } else {
      existingByFile.set(file, issue);
    }
  }

  const update: IssueUpdate[] = [];
  const missingClose: Array<{ number: number }> = [];

  for (const [file, issue] of existingByFile) {
    const findings = groups.get(file);
    if (findings?.length) {
      const draft = draftForExistingIssue(issue, makeDraft(file, findings));
      if (!issueMatchesDraft(issue, draft)) {
        update.push({
          number: issue.number,
          ...draft,
        });
      }
    } else {
      missingClose.push({ number: issue.number });
    }
  }

  const maxClosures = Math.min(
    25,
    Math.max(5, Math.ceil(existingByFile.size * 0.5)),
  );
  const closureGuardTriggered = missingClose.length > maxClosures;
  const close = closureGuardTriggered
    ? duplicateClose
    : [...duplicateClose, ...missingClose];

  const newGroups = [...groups.entries()].filter(
    ([file]) => !existingByFile.has(file),
  );
  const totalFindings = [...groups.values()].reduce(
    (sum, findings) => sum + findings.length,
    0,
  );

  const create = newGroups
    .slice(0, maxNewIssues)
    .map(([file, findings]) => makeDraft(file, findings));
  const overflow = newGroups.length - create.length;

  let meta: MetaChange | null = null;
  if (closureGuardTriggered) {
    const overflowNote =
      overflow > 0
        ? ` This run also created at most ${maxNewIssues} new per-file issues; **${overflow} additional files** remain queued.`
        : '';
    const blockedIssues = missingClose
      .slice(0, 25)
      .map(({ number }) => `#${number}`)
      .join(', ');
    const blockedIssueNote = ` Blocked issue${missingClose.length === 1 ? '' : 's'}: ${blockedIssues}${missingClose.length > 25 ? `, and ${missingClose.length - 25} more` : ''}.`;
    const draft: IssueDraft = {
      title: `[react-doctor] Weekly audit safety hold (${missingClose.length} closures blocked)`,
      body: metaBody(
        groups,
        totalFindings,
        `The audit proposed closing **${missingClose.length} of ${existingByFile.size} tracked file issues**, exceeding the safety limit of ${maxClosures}. Those closures were skipped to protect against an under-reported or truncated scan.${blockedIssueNote}${overflowNote}`,
      ),
      labels: [...BASE_LABELS, severityLabel([...groups.values()].flat())],
    };
    meta = metaChangeForDraft(existingMeta, draft);
  } else if (overflow > 0) {
    const draft: IssueDraft = {
      title: `[react-doctor] Weekly audit overflow (${overflow} files queued)`,
      body: metaBody(
        groups,
        totalFindings,
        `This run created at most ${maxNewIssues} new per-file issues. **${overflow} additional files** remain queued to avoid flooding GitHub.`,
      ),
      labels: [...BASE_LABELS, severityLabel([...groups.values()].flat())],
    };
    meta = metaChangeForDraft(existingMeta, draft);
  } else if (existingMeta) {
    meta = { action: 'close', number: existingMeta.number };
  }

  return { create, update, close, meta };
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function retryDelayMs(
  response: Response,
  attempt: number,
  method = 'GET',
): number | null {
  const normalizedMethod = method.toUpperCase();
  const isPost = normalizedMethod === 'POST';
  const rateLimitRemaining = response.headers.get('x-ratelimit-remaining');
  const isExplicitRateLimit =
    response.status === 429 ||
    (response.status === 403 && rateLimitRemaining === '0');

  // Retrying a POST after an ambiguous 5xx can duplicate an issue if GitHub
  // committed the write before returning the error. Only retry POSTs when the
  // response explicitly says the request was rate-limited.
  if (isPost && !isExplicitRateLimit) return null;

  const retryAfter = response.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(seconds * 1000, 60_000);
  }

  const rateLimitReset = response.headers.get('x-ratelimit-reset');
  if (rateLimitReset && rateLimitRemaining === '0') {
    const resetMs = Number(rateLimitReset) * 1000 - Date.now();
    if (Number.isFinite(resetMs))
      return Math.min(Math.max(resetMs, 1000), 60_000);
  }

  if (response.status === 429 || response.status >= 500) {
    return Math.min(1000 * 2 ** attempt, 10_000);
  }
  return null;
}

async function githubRequest<T>(
  repo: string,
  token: string,
  endpoint: string,
  init: RequestInit = {},
): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const method = init.method ?? 'GET';
    let response: Response;
    try {
      response = await fetch(
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // A transport failure after a POST is ambiguous: GitHub may have
      // committed the issue before the connection failed. Do not retry it.
      if (method.toUpperCase() === 'POST' || attempt >= 3) {
        throw new Error(
          `GitHub API ${method} ${endpoint} transport failure: ${message}`,
          { cause: error },
        );
      }
      const delay = Math.min(1000 * 2 ** attempt, 10_000);
      console.warn(
        `GitHub API ${method} ${endpoint} transport failure; retrying after ${delay}ms`,
      );
      await sleep(delay);
      continue;
    }

    if (response.ok) {
      const result =
        response.status === 204
          ? (undefined as T)
          : ((await response.json()) as T);
      if (init.method && init.method !== 'GET') await sleep(800);
      return result;
    }

    const delay = retryDelayMs(response, attempt, init.method ?? 'GET');
    if (delay !== null && attempt < 3) {
      console.warn(
        `GitHub API ${init.method ?? 'GET'} ${endpoint} returned ${response.status}; retrying after ${delay}ms`,
      );
      await sleep(delay);
      continue;
    }

    const text = await response.text();
    throw new Error(
      `GitHub API ${init.method ?? 'GET'} ${endpoint} failed (${response.status}): ${text}`,
    );
  }

  throw new Error(
    `GitHub API request unexpectedly exhausted retries: ${endpoint}`,
  );
}

async function listTrackedIssues(
  repo: string,
  token: string,
): Promise<ExistingIssue[]> {
  const issues: ExistingIssue[] = [];
  const seenNumbers = new Set<number>();
  for (let page = 1; page <= 10; page += 1) {
    const batch = await githubRequest<ExistingIssue[]>(
      repo,
      token,
      `/issues?state=open&labels=react-doctor&per_page=100&page=${page}`,
    );
    for (const issue of batch) {
      if (issue.pull_request || seenNumbers.has(issue.number)) continue;
      seenNumbers.add(issue.number);
      issues.push(issue);
    }
    if (batch.length < 100) break;
  }
  return issues;
}

async function ensureLabels(repo: string, token: string): Promise<void> {
  const names = new Set<string>();
  for (let page = 1; page <= 10; page += 1) {
    const batch = await githubRequest<Array<{ name: string }>>(
      repo,
      token,
      `/labels?per_page=100&page=${page}`,
    );
    for (const label of batch) names.add(label.name);
    if (batch.length < 100) break;
  }

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
  const failures: Error[] = [];
  const mutate = async (
    description: string,
    endpoint: string,
    init: RequestInit,
  ): Promise<void> => {
    try {
      await githubRequest(repo, token, endpoint, init);
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      failures.push(new Error(`${description}: ${cause.message}`, { cause }));
    }
  };

  for (const issue of plan.update) {
    await mutate(`update issue #${issue.number}`, `/issues/${issue.number}`, {
      method: 'PATCH',
      body: JSON.stringify({
        title: issue.title,
        body: issue.body,
        labels: issue.labels,
      }),
    });
  }

  for (const issue of plan.create) {
    await mutate(`create issue ${issue.title}`, '/issues', {
      method: 'POST',
      body: JSON.stringify(issue),
    });
  }

  if (plan.meta?.action === 'create') {
    await mutate(`create meta issue ${plan.meta.title}`, '/issues', {
      method: 'POST',
      body: JSON.stringify({
        title: plan.meta.title,
        body: plan.meta.body,
        labels: plan.meta.labels,
      }),
    });
  } else if (plan.meta?.action === 'update') {
    await mutate(
      `update meta issue #${plan.meta.number}`,
      `/issues/${plan.meta.number}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          title: plan.meta.title,
          body: plan.meta.body,
          labels: plan.meta.labels,
        }),
      },
    );
  }

  // Destructive mutations are last so a transient failure cannot close tracked
  // work before current findings and backlog state have been persisted.
  for (const issue of plan.close) {
    await mutate(`close issue #${issue.number}`, `/issues/${issue.number}`, {
      method: 'PATCH',
      body: JSON.stringify({ state: 'closed', state_reason: 'completed' }),
    });
  }

  if (plan.meta?.action === 'close') {
    await mutate(
      `close meta issue #${plan.meta.number}`,
      `/issues/${plan.meta.number}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ state: 'closed', state_reason: 'completed' }),
      },
    );
  }

  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      `React Doctor reconciliation completed with ${failures.length} failed GitHub mutation${failures.length === 1 ? '' : 's'}; rerun is safe because the plan is idempotent.`,
    );
  }
}

async function main(): Promise<void> {
  const reportPath = process.argv[2] ?? 'react-doctor-report.json';
  const dryRun =
    process.env.REACT_DOCTOR_DRY_RUN === '1' ||
    process.argv.includes('--dry-run');
  const report = JSON.parse(await readFile(reportPath, 'utf8')) as unknown;

  assertReconciliableReport(report);
  const diagnostics = extractDiagnostics(report);
  const groups = groupDiagnosticsByFile(diagnostics);

  if (dryRun) {
    const plan = buildIssuePlan({
      groups,
      existingIssues: [],
    });
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (!repo) throw new Error('GITHUB_REPOSITORY is required');
  if (!token) throw new Error('GITHUB_TOKEN or GH_TOKEN is required');

  await ensureLabels(repo, token);
  const existingIssues = await listTrackedIssues(repo, token);
  const plan = buildIssuePlan({ groups, existingIssues });
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
    if (error instanceof AggregateError) {
      for (const inner of error.errors) {
        console.error(inner instanceof Error ? inner.stack : inner);
      }
    }
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
