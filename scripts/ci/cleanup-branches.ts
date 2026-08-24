import { spawn } from 'node:child_process';

import { branchKey } from './branch-key';
import {
  credentialsFromEnvironment,
  deleteWorker,
  listWorkerScripts,
  replaceWorkerTags,
  type WorkerScript
} from './cloudflare-api';

const PREFIXES = ['wheel-site-', 'wheel-tracker-'] as const;
const ORPHAN_PREFIX = 'orphaned-at:';
const RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;

export type CleanupAction =
  | { readonly type: 'mark'; readonly worker: string; readonly tags: readonly string[] }
  | { readonly type: 'clear'; readonly worker: string; readonly tags: readonly string[] }
  | { readonly type: 'delete'; readonly worker: string };

function keyFromWorker(name: string): string | null {
  const prefix = PREFIXES.find((candidate) => name.startsWith(candidate));
  return prefix ? name.slice(prefix.length) : null;
}

function orphanedAt(tags: readonly string[]): number | null {
  const tag = tags.find((candidate) => candidate.startsWith(ORPHAN_PREFIX));
  if (!tag) return null;
  const timestamp = Date.parse(tag.slice(ORPHAN_PREFIX.length));
  return Number.isFinite(timestamp) ? timestamp : null;
}

function withoutOrphan(tags: readonly string[]): string[] {
  return tags.filter((tag) => !tag.startsWith(ORPHAN_PREFIX));
}

export function planBranchCleanup(input: {
  readonly scripts: readonly WorkerScript[];
  readonly liveWorkers: ReadonlySet<string>;
  readonly now: number;
}): CleanupAction[] {
  const managed = input.scripts.filter((script) => keyFromWorker(script.id) !== null);
  const actions: CleanupAction[] = [];
  for (const script of managed) {
    if (input.liveWorkers.has(script.id)) {
      const tags = withoutOrphan(script.tags);
      if (tags.length !== script.tags.length) {
        actions.push({ type: 'clear', worker: script.id, tags });
      }
      continue;
    }

    const markedAt = orphanedAt(script.tags);
    if (markedAt === null) {
      const tag = `${ORPHAN_PREFIX}${new Date(input.now).toISOString()}`;
      actions.push({
        type: 'mark',
        worker: script.id,
        tags: [...withoutOrphan(script.tags), tag]
      });
      continue;
    }

    if (input.now - markedAt >= RETENTION_MS) {
      actions.push({ type: 'delete', worker: script.id });
    }
  }
  return actions.sort((left, right) => left.worker.localeCompare(right.worker));
}

function runGit(args: readonly string[]): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('git', args, { stdio: ['ignore', 'pipe', 'inherit'] });
    let output = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      output += chunk;
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolvePromise(output);
      else reject(new Error(`git exited with code ${code ?? 'unknown'}.`));
    });
  });
}

export function workerNamesForBranches(branches: readonly string[]): Set<string> {
  const workers = new Set<string>();
  for (const branch of branches) {
    const key = branchKey(branch);
    if (branch !== 'main') workers.add(`wheel-site-${key}`);
    workers.add(`wheel-tracker-${key}`);
  }
  return workers;
}

async function liveBranchWorkers(): Promise<Set<string>> {
  const remote = process.env.BUILDKITE_REPO ?? 'origin';
  const output = await runGit(['ls-remote', '--heads', remote]);
  return workerNamesForBranches(
    output
      .split('\n')
      .map((line) => line.match(/\srefs\/heads\/(.+)$/)?.[1])
      .filter((branch): branch is string => Boolean(branch))
  );
}

export async function cleanupBranches(apply: boolean): Promise<CleanupAction[]> {
  const credentials = credentialsFromEnvironment();
  const actions = planBranchCleanup({
    scripts: await listWorkerScripts(credentials),
    liveWorkers: await liveBranchWorkers(),
    now: Date.now()
  });
  console.log(JSON.stringify({ apply, actions }, null, 2));
  if (!apply) return actions;
  for (const action of actions) {
    if (action.type === 'delete') await deleteWorker(credentials, action.worker);
    else await replaceWorkerTags(credentials, action.worker, action.tags);
  }
  return actions;
}

if (import.meta.main) await cleanupBranches(process.argv.includes('--apply'));
