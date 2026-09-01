import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';

import {
  BEHAVIOR_CATALOG,
  BEHAVIOR_COVERAGE_PHASE,
  type BehaviorApp,
  type BehaviorCatalogEntry
} from '../test/behaviors/catalog';

interface BehaviorSource {
  readonly file: string;
  readonly text: string;
}

interface CoverageInput {
  readonly catalog: readonly BehaviorCatalogEntry[];
  readonly coveragePhase: number;
  readonly sources: readonly BehaviorSource[];
  readonly pipeline: string;
}

const APP_DIRECTORIES: Record<BehaviorApp, string> = {
  axle: 'packages/tracker/browser/',
  rounds: 'packages/rounds/browser/',
  chalk: 'packages/chalk/browser/',
  spoke: 'packages/spoke/browser/'
};

const CI_STEPS: Partial<Record<`${BehaviorApp}/${BehaviorCatalogEntry['primary']['backend']}`, string>> = {
  'axle/sqlite': 'check-browser-apps-sqlite',
  'rounds/sqlite': 'check-browser-apps-sqlite',
  'chalk/sqlite': 'check-browser-apps-sqlite',
  'spoke/sqlite': 'check-browser-apps-sqlite',
  'spoke/do': 'check-spoke-do',
  'spoke/postgres': 'check-spoke-postgres',
  'spoke/two-node-postgres': 'check-spoke-postgres'
};

const CI_STEP_OVERRIDES: Readonly<Record<string, string>> = {
  'dur-epoch': 'check-rounds-upgrade',
  'contract-retire': 'check-rounds-upgrade',
  'contract-outbox': 'check-rounds-upgrade',
  'contract-reload': 'check-rounds-upgrade'
};

function taggedTests(source: BehaviorSource): Array<{ readonly id: string; readonly file: string }> {
  const tags: Array<{ id: string; file: string }> = [];
  const testTitle = /\btest(?:\.(?:only|skip|fixme))?\(\s*(['"`])([^'"`\n]*)\1/g;
  for (const title of source.text.matchAll(testTitle)) {
    for (const tag of title[2]!.matchAll(/@behavior:([a-z][a-z0-9-]*)/g)) {
      tags.push({ id: tag[1]!, file: source.file });
    }
  }
  return tags;
}

/** Validate literal Playwright behavior tags without claiming that any test passed. */
export function validateBehaviorCoverage(input: CoverageInput): string[] {
  const errors: string[] = [];
  const rows = new Map(input.catalog.map((entry) => [entry.id, entry]));
  if (rows.size !== input.catalog.length) errors.push('behavior catalog contains duplicate IDs');

  const tags = input.sources.flatMap(taggedTests);
  for (const tag of tags) {
    if (!rows.has(tag.id)) errors.push(`unknown behavior tag ${tag.id} in ${tag.file}`);
  }

  for (const row of input.catalog) {
    if (row.phase > input.coveragePhase || row.stretch) continue;
    const appDirectory = APP_DIRECTORIES[row.primary.app];
    const primary = tags.filter((tag) => tag.id === row.id && tag.file.startsWith(appDirectory));
    if (primary.length === 0) {
      errors.push(`missing primary behavior tag ${row.id} in ${appDirectory}`);
    } else if (primary.length > 1) {
      errors.push(`duplicate primary behavior tag ${row.id}: ${primary.map((tag) => tag.file).join(', ')}`);
    }

    const pair = `${row.primary.app}/${row.primary.backend}` as const;
    const ciStep = CI_STEP_OVERRIDES[row.id] ?? CI_STEPS[pair];
    if (!ciStep || !input.pipeline.includes(`key: "${ciStep}"`)) {
      errors.push(`primary behavior ${row.id} has no CI leg for ${pair}`);
    }
  }
  return errors;
}

function browserSources(root: string): BehaviorSource[] {
  const sources: BehaviorSource[] = [];
  for (const app of Object.keys(APP_DIRECTORIES) as BehaviorApp[]) {
    const directory = resolve(root, APP_DIRECTORIES[app]);
    try {
      for (const name of readdirSync(directory).filter((entry) => entry.endsWith('.spec.ts'))) {
        const file = resolve(directory, name);
        sources.push({ file: relative(root, file), text: readFileSync(file, 'utf8') });
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return sources;
}

/** Check the repository's active behavior coverage phase. */
export function checkBehaviorCoverage(root = process.cwd()): string[] {
  return validateBehaviorCoverage({
    catalog: BEHAVIOR_CATALOG,
    coveragePhase: BEHAVIOR_COVERAGE_PHASE,
    sources: browserSources(root),
    pipeline: readFileSync(resolve(root, '.buildkite/pipeline.yml'), 'utf8')
  });
}

if (import.meta.main) {
  if (!process.argv.includes('--check')) {
    throw new Error('usage: bun scripts/behavior-coverage.ts --check');
  }
  const errors = checkBehaviorCoverage();
  if (errors.length > 0) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else {
    const required = BEHAVIOR_CATALOG.filter(
      (entry) => !entry.stretch && entry.phase <= BEHAVIOR_COVERAGE_PHASE
    ).length;
    const stretch = BEHAVIOR_CATALOG.filter((entry) => entry.stretch).length;
    console.log(`behavior coverage: ${required} required primary tags; ${stretch} stretch tag`);
  }
}
