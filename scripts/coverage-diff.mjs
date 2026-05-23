#!/usr/bin/env node
import { error, log } from 'node:console';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const COVERAGE_PATH = path.resolve('coverage/coverage-final.json');
const BASELINE_PATH = path.resolve('.auto/baseline.json');
const METRICS = ['lines', 'functions', 'branches', 'statements'];
const THRESHOLD = 80;

const args = new Set(process.argv.slice(2));
const shouldSaveBaseline = args.has('--baseline');
const shouldOutputJson = args.has('--json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function pct(covered, total) {
  if (total === 0) return 100;
  return Number(((covered / total) * 100).toFixed(2));
}

function summarizeCoverage(coverage) {
  const totals = {
    lines: { total: 0, covered: 0, pct: 100 },
    functions: { total: 0, covered: 0, pct: 100 },
    branches: { total: 0, covered: 0, pct: 100 },
    statements: { total: 0, covered: 0, pct: 100 },
  };
  const files = {};

  for (const [absoluteFilePath, fileCoverage] of Object.entries(coverage)) {
    const relativeFilePath = path.relative(process.cwd(), absoluteFilePath);
    const summary = summarizeFile(fileCoverage);
    const uncovered = getUncovered(relativeFilePath, fileCoverage);

    files[relativeFilePath] = {
      summary,
      uncovered,
    };

    for (const metric of METRICS) {
      totals[metric].total += summary[metric].total;
      totals[metric].covered += summary[metric].covered;
    }
  }

  for (const metric of METRICS) {
    totals[metric].pct = pct(totals[metric].covered, totals[metric].total);
  }

  return {
    generatedAt: new Date().toISOString(),
    threshold: THRESHOLD,
    summary: totals,
    files,
  };
}

function summarizeFile(fileCoverage) {
  const statements = values(fileCoverage.s);
  const functions = values(fileCoverage.f);
  const branches = Object.values(fileCoverage.b ?? {}).flat();
  const lineHits = new Map();

  for (const [id, statement] of Object.entries(
    fileCoverage.statementMap ?? {},
  )) {
    const line = statement?.start?.line;
    if (typeof line !== 'number') continue;
    const hits = Number(fileCoverage.s?.[id] ?? 0);
    lineHits.set(line, (lineHits.get(line) ?? 0) + hits);
  }

  return {
    lines: summarizeHits([...lineHits.values()]),
    functions: summarizeHits(functions),
    branches: summarizeHits(branches),
    statements: summarizeHits(statements),
  };
}

function summarizeHits(hits) {
  const total = hits.length;
  const covered = hits.filter((hit) => Number(hit) > 0).length;
  return { total, covered, pct: pct(covered, total) };
}

function getUncovered(filePath, fileCoverage) {
  const uncoveredLines = [];
  const uncoveredFunctions = [];
  const uncoveredBranches = [];

  const lineHits = new Map();

  for (const [id, statement] of Object.entries(
    fileCoverage.statementMap ?? {},
  )) {
    const line = statement?.start?.line;
    if (typeof line !== 'number') continue;
    const hits = Number(fileCoverage.s?.[id] ?? 0);
    lineHits.set(line, (lineHits.get(line) ?? 0) + hits);
  }

  for (const [line, hits] of [...lineHits.entries()].sort(
    ([a], [b]) => a - b,
  )) {
    if (hits === 0) {
      uncoveredLines.push(`${filePath}:${line}`);
    }
  }

  for (const [id, fn] of Object.entries(fileCoverage.fnMap ?? {})) {
    if (Number(fileCoverage.f?.[id] ?? 0) > 0) continue;
    const line = fn?.loc?.start?.line ?? fn?.decl?.start?.line ?? 0;
    const name =
      fn?.name && fn.name !== '(anonymous)' ? fn.name : `function-${id}`;
    uncoveredFunctions.push(`${filePath}:${line}:${name}`);
  }

  for (const [id, branch] of Object.entries(fileCoverage.branchMap ?? {})) {
    const hits = fileCoverage.b?.[id] ?? [];
    hits.forEach((hit, index) => {
      if (Number(hit) > 0) return;
      const location = branch.locations?.[index] ?? branch.loc;
      const line = location?.start?.line ?? branch.loc?.start?.line ?? 0;
      const type = branch.type ?? 'branch';
      uncoveredBranches.push(`${filePath}:${line}:${type}[${index}]`);
    });
  }

  return {
    lines: uncoveredLines,
    functions: uncoveredFunctions,
    branches: uncoveredBranches,
  };
}

function values(record) {
  return Object.values(record ?? {}).map((value) => Number(value));
}

function createBaseline(current) {
  return {
    generatedAt: current.generatedAt,
    threshold: current.threshold,
    summary: current.summary,
  };
}

function diffCoverage(current, baseline) {
  const metrics = {};

  for (const metric of METRICS) {
    const currentMetric = current.summary[metric];
    const baselineMetric = baseline?.summary?.[metric] ?? null;
    const pctDelta = baselineMetric
      ? Number((currentMetric.pct - baselineMetric.pct).toFixed(2))
      : 0;
    const coveredDelta = baselineMetric
      ? currentMetric.covered - baselineMetric.covered
      : 0;

    metrics[metric] = {
      current: currentMetric,
      baseline: baselineMetric,
      delta: {
        pct: pctDelta,
        covered: coveredDelta,
      },
      tier: getMetricTier(currentMetric, baselineMetric),
    };
  }

  const tier = METRICS.some((metric) => metrics[metric].tier === 'RED')
    ? 'RED'
    : METRICS.some((metric) => metrics[metric].tier === 'YELLOW')
      ? 'YELLOW'
      : 'GREEN';

  return {
    tier,
    metrics,
    files: current.files,
  };
}

function getMetricTier(currentMetric, baselineMetric) {
  if (currentMetric.pct < THRESHOLD) return 'RED';
  if (baselineMetric && currentMetric.pct < baselineMetric.pct) return 'YELLOW';
  return 'GREEN';
}

function formatDelta(value, suffix = '') {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value}${suffix}`;
}

function printHumanReport(result, baselineCreated) {
  if (baselineCreated) {
    log(`Baseline created at ${path.relative(process.cwd(), BASELINE_PATH)}`);
  }

  log(`Coverage tier: ${result.tier}`);
  log('');
  log('Metrics:');

  for (const metric of METRICS) {
    const entry = result.metrics[metric];
    const current = entry.current;
    const baseline = entry.baseline;
    const baselinePct = baseline ? `${baseline.pct}%` : 'none';
    log(
      `- ${metric}: ${entry.tier} ${current.pct}% (${current.covered}/${current.total}), baseline ${baselinePct}, delta ${formatDelta(entry.delta.pct, '%')} / ${formatDelta(entry.delta.covered)}`,
    );
  }

  log('');
  log('Uncovered by file:');

  let hasUncovered = false;
  for (const [filePath, file] of Object.entries(result.files).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const { lines, functions, branches } = file.uncovered;
    if (!lines.length && !functions.length && !branches.length) continue;

    hasUncovered = true;
    log(`- ${filePath}`);
    if (lines.length) log(`  lines: ${lines.join(', ')}`);
    if (functions.length) log(`  functions: ${functions.join(', ')}`);
    if (branches.length) log(`  branches: ${branches.join(', ')}`);
  }

  if (!hasUncovered) {
    log('- none');
  }
}

if (!fs.existsSync(COVERAGE_PATH)) {
  error(
    `Coverage report not found at ${path.relative(process.cwd(), COVERAGE_PATH)}. Run npm run test:coverage first.`,
  );
  process.exit(1);
}

const current = summarizeCoverage(readJson(COVERAGE_PATH));
const baselineExists = fs.existsSync(BASELINE_PATH);
let baseline = baselineExists ? readJson(BASELINE_PATH) : null;
let baselineCreated = false;

if (shouldSaveBaseline || !baselineExists) {
  baseline = createBaseline(current);
  writeJson(BASELINE_PATH, baseline);
  baselineCreated = true;
}

const result = {
  baselineCreated,
  ...diffCoverage(current, baseline),
};

if (shouldOutputJson) {
  log(JSON.stringify(result, null, 2));
} else {
  printHumanReport(result, baselineCreated);
}

// Exit non-zero on coverage regression
if (result.tier === 'RED' || result.tier === 'YELLOW') {
  process.exit(1);
}
