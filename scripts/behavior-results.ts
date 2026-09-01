import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { BEHAVIOR_CATALOG, type BehaviorCatalogEntry } from '../test/behaviors/catalog';

type ProofState = 'passed' | 'failed' | 'skipped';

interface PlaywrightTestResult {
  readonly status?: string;
}

interface PlaywrightTest {
  readonly expectedStatus?: string;
  readonly status?: string;
  readonly results?: readonly PlaywrightTestResult[];
}

interface PlaywrightSpec {
  readonly title?: string;
  readonly tags?: readonly string[];
  readonly ok?: boolean;
  readonly tests?: readonly PlaywrightTest[];
}

interface PlaywrightSuite {
  readonly specs?: readonly PlaywrightSpec[];
  readonly suites?: readonly PlaywrightSuite[];
}

export interface BehaviorReport {
  readonly file: string;
  readonly config?: {
    readonly metadata?: Record<string, unknown>;
  };
  readonly suites?: readonly PlaywrightSuite[];
}

interface ReportSummary {
  readonly app: string;
  readonly backend: string;
  readonly variant: string;
  readonly tests: number;
  readonly state: ProofState;
  readonly primaryProofs: readonly string[];
}

export interface BehaviorResultSummary {
  readonly errors: readonly string[];
  readonly passed: number;
  readonly required: number;
  readonly reports: readonly ReportSummary[];
  readonly stretch: readonly { readonly id: string; readonly state: ProofState | 'unrun' }[];
}

function specs(suites: readonly PlaywrightSuite[]): PlaywrightSpec[] {
  return suites.flatMap((suite) => [
    ...(suite.specs ?? []),
    ...specs(suite.suites ?? [])
  ]);
}

function behaviorIds(spec: PlaywrightSpec): string[] {
  const tagged = (spec.tags ?? [])
    .map((tag) => /^@?behavior:([a-z][a-z0-9-]*)$/.exec(tag)?.[1])
    .filter((id): id is string => id !== undefined);
  return tagged.length > 0
    ? tagged
    : [...(spec.title ?? '').matchAll(/@behavior:([a-z][a-z0-9-]*)/g)].map((tag) => tag[1]!);
}

function state(spec: PlaywrightSpec): ProofState {
  const tests = spec.tests ?? [];
  if (tests.length === 0 || tests.some((test) => test.status === 'skipped')) return 'skipped';
  const passed = tests.every((test) => {
    const last = test.results?.at(-1);
    return (
      test.expectedStatus === 'passed' &&
      (test.status === 'expected' || test.status === 'flaky') &&
      last?.status === 'passed'
    );
  });
  return spec.ok && passed ? 'passed' : 'failed';
}

function metadata(report: BehaviorReport): { app: string; backend: string; variant: string } | undefined {
  const values = report.config?.metadata;
  const app = values?.behaviorApp;
  const backend = values?.behaviorBackend;
  const variant = values?.behaviorVariant;
  if (typeof app !== 'string' || typeof backend !== 'string' || typeof variant !== 'string') return undefined;
  return { app, backend, variant };
}

export function validateBehaviorResults(
  catalog: readonly BehaviorCatalogEntry[],
  reports: readonly BehaviorReport[],
  loadErrors: readonly string[] = []
): BehaviorResultSummary {
  const errors = [...loadErrors];
  const rows = new Map(catalog.map((entry) => [entry.id, entry]));
  const proofs = new Map<string, Array<{ file: string; state: ProofState }>>();
  const reportSummaries: ReportSummary[] = [];

  for (const report of reports) {
    const identity = metadata(report);
    if (!identity) {
      errors.push(`${report.file}: missing behaviorApp, behaviorBackend, or behaviorVariant metadata`);
      continue;
    }

    const reportSpecs = specs(report.suites ?? []);
    const primaryProofs: string[] = [];
    for (const spec of reportSpecs) {
      for (const id of behaviorIds(spec)) {
        const row = rows.get(id);
        if (!row) {
          errors.push(`${report.file}: unknown behavior ${id}`);
          continue;
        }
        if (row.primary.app !== identity.app || row.primary.backend !== identity.backend) continue;
        const entries = proofs.get(id) ?? [];
        entries.push({ file: report.file, state: state(spec) });
        proofs.set(id, entries);
        primaryProofs.push(id);
      }
    }

    const reportStates = reportSpecs.map(state);
    reportSummaries.push({
      ...identity,
      tests: reportSpecs.length,
      state: reportStates.includes('failed')
        ? 'failed'
        : reportStates.includes('skipped')
          ? 'skipped'
          : 'passed',
      primaryProofs: [...new Set(primaryProofs)].sort()
    });
  }

  let passed = 0;
  for (const row of catalog.filter((entry) => !entry.stretch)) {
    const entries = proofs.get(row.id) ?? [];
    if (entries.length === 0) {
      errors.push(`missing primary behavior ${row.id}`);
    } else if (entries.length > 1) {
      errors.push(`duplicate primary behavior ${row.id}: ${entries.map((entry) => entry.file).join(', ')}`);
    } else if (entries[0]!.state !== 'passed') {
      errors.push(`${entries[0]!.state} primary behavior ${row.id}: ${entries[0]!.file}`);
    } else {
      passed += 1;
    }
  }

  return {
    errors,
    passed,
    required: catalog.filter((entry) => !entry.stretch).length,
    reports: reportSummaries.sort((a, b) =>
      `${a.app}/${a.backend}/${a.variant}`.localeCompare(`${b.app}/${b.backend}/${b.variant}`)
    ),
    stretch: catalog
      .filter((entry) => entry.stretch)
      .map((entry) => ({ id: entry.id, state: proofs.get(entry.id)?.[0]?.state ?? 'unrun' }))
  };
}

export function renderBehaviorResults(summary: BehaviorResultSummary): string {
  const lines = [
    '# Wheel behavior coverage',
    '',
    `${summary.passed}/${summary.required} required primary behaviors passed.`,
    '',
    '| App | Backend | Variant | Tests | Result | Primary proofs |',
    '|---|---|---|---:|---|---|',
    ...summary.reports.map(
      (report) =>
        `| ${report.app} | ${report.backend} | ${report.variant} | ${report.tests} | ${report.state} | ${report.primaryProofs.join(', ') || '—'} |`
    ),
    '',
    `Stretch: ${summary.stretch.map((entry) => `\`${entry.id}\` ${entry.state}`).join(', ')}.`
  ];
  if (summary.errors.length > 0) {
    lines.push('', '## Errors', '', ...summary.errors.map((error) => `- ${error}`));
  }
  return `${lines.join('\n')}\n`;
}

function readReports(directory: string): { reports: BehaviorReport[]; errors: string[] } {
  const reports: BehaviorReport[] = [];
  const errors: string[] = [];
  let names: string[];
  try {
    names = readdirSync(directory).filter((name) => name.endsWith('.json'));
  } catch (error) {
    return { reports, errors: [`cannot read ${directory}: ${(error as Error).message}`] };
  }
  for (const name of names) {
    const file = resolve(directory, name);
    try {
      reports.push({ ...(JSON.parse(readFileSync(file, 'utf8')) as BehaviorReport), file });
    } catch (error) {
      errors.push(`${file}: invalid Playwright JSON: ${(error as Error).message}`);
    }
  }
  return { reports, errors };
}

if (import.meta.main) {
  const directory = resolve(process.argv[2] ?? '.artifacts/behavior-results');
  const loaded = readReports(directory);
  const summary = validateBehaviorResults(BEHAVIOR_CATALOG, loaded.reports, loaded.errors);
  process.stdout.write(renderBehaviorResults(summary));
  if (summary.errors.length > 0) process.exitCode = 1;
}
