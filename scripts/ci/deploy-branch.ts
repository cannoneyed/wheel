import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

import { branchKey } from './branch-key';
import {
  credentialsFromEnvironment,
  enableWorkersDev,
  listWorkerScripts,
  replaceWorkerTags,
  workersDevSubdomain
} from './cloudflare-api';

interface DeployEvent {
  readonly type?: string;
  readonly worker_name?: string;
  readonly version_id?: string | null;
  readonly worker_name_overridden?: boolean;
  readonly targets?: unknown;
}

interface DeployResult {
  readonly name: string;
  readonly url: string;
}

interface WorkerDeployment {
  readonly name: string;
  readonly config: string;
  readonly publicUrl?: string;
}

export interface DeploymentPlan {
  readonly production: boolean;
  readonly site: WorkerDeployment;
  readonly tracker: WorkerDeployment;
}

const ORPHAN_PREFIX = 'orphaned-at:';
const PRODUCTION_BRANCH = 'main';
const PRODUCTION_SITE_URL = 'https://wheel.dev';

export function deploymentPlan(branch: string): DeploymentPlan {
  const key = branchKey(branch);
  return {
    production: branch === PRODUCTION_BRANCH,
    site:
      branch === PRODUCTION_BRANCH
        ? {
            name: 'wheel-site',
            config: 'wrangler.website.production.jsonc',
            publicUrl: PRODUCTION_SITE_URL
          }
        : { name: `wheel-site-${key}`, config: 'wrangler.website.jsonc' },
    tracker: { name: `wheel-tracker-${key}`, config: 'wrangler.tracker.jsonc' }
  };
}

function run(
  command: string,
  args: readonly string[],
  options: { readonly env?: NodeJS.ProcessEnv; readonly input?: string } = {}
): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      stdio: ['pipe', 'inherit', 'inherit'],
      env: options.env ?? process.env
    });
    if (options.input) child.stdin.end(options.input);
    else child.stdin.end();
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} exited with code ${code ?? 'unknown'}.`));
    });
  });
}

function collectUrls(value: unknown, urls: string[]): void {
  if (typeof value === 'string') {
    if (/^https:\/\//.test(value)) urls.push(value);
    else if (/^[a-z0-9.-]+\.workers\.dev\/?$/i.test(value)) urls.push(`https://${value}`);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectUrls(entry, urls);
    return;
  }
  if (value && typeof value === 'object') {
    for (const entry of Object.values(value)) collectUrls(entry, urls);
  }
}

export function deployUrlFromOutput(text: string, workerName: string): string {
  const events = text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as DeployEvent);
  const event = events.find((entry) => entry.type === 'deploy');
  if (event?.worker_name !== workerName) {
    throw new Error(
      `Wrangler deployed ${event?.worker_name ?? 'no Worker'} instead of ${workerName}.`
    );
  }
  const urls: string[] = [];
  collectUrls(event.targets, urls);
  const target = urls.find((url) => url.includes('.workers.dev')) ?? urls[0];
  if (!target) {
    throw new Error(
      `Wrangler returned no deployment URL for ${workerName}: ${JSON.stringify({
        version_id: event.version_id,
        worker_name_overridden: event.worker_name_overridden,
        targets: event.targets
      })}.`
    );
  }
  return target.replace(/\/$/, '');
}

async function deployWorker(input: {
  readonly name: string;
  readonly config: string;
  readonly outputDirectory: string;
  readonly publicUrl?: string;
  readonly vars?: Readonly<Record<string, string>>;
}): Promise<DeployResult> {
  const outputPath = join(input.outputDirectory, `${input.name}.jsonl`);
  const args = [
    resolve('node_modules/wrangler/bin/wrangler.js'),
    'deploy',
    '--config',
    input.config,
    '--name',
    input.name
  ];
  for (const [name, value] of Object.entries(input.vars ?? {}).sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    args.push('--var', `${name}:${value}`);
  }
  await run(
    process.env.WRANGLER_RUNTIME ?? 'node',
    args,
    { env: { ...process.env, WRANGLER_OUTPUT_FILE_PATH: outputPath } }
  );
  const output = await readFile(outputPath, 'utf8');
  let url: string;
  try {
    url = deployUrlFromOutput(output, input.name);
  } catch (error) {
    console.warn(`${String((error as Error).message)} Resolving it through the Cloudflare API.`);
    url = `https://${input.name}.${await workersDevSubdomain(credentialsFromEnvironment())}`;
  }
  return {
    name: input.name,
    url: input.publicUrl ?? url
  };
}

export async function waitForOk(
  url: string,
  options: {
    readonly attempts?: number;
    readonly expectedCommit?: string;
    readonly fetch?: typeof fetch;
    readonly delay?: (ms: number) => Promise<void>;
  } = {}
): Promise<void> {
  const attempts = options.attempts ?? 8;
  const fetchUrl = options.fetch ?? fetch;
  const delay = options.delay ?? ((ms: number) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms)));
  let lastStatus = 'no response';
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchUrl(url, { redirect: 'follow' });
      lastStatus = `HTTP ${response.status}`;
      if (response.ok) {
        const deployedCommit = response.headers.get('x-wheel-commit');
        if (!options.expectedCommit || deployedCommit === options.expectedCommit) return;
        lastStatus = `HTTP ${response.status} with x-wheel-commit ${deployedCommit ?? 'missing'}`;
      }
    } catch (error) {
      lastStatus = String((error as Error)?.message ?? error);
    }
    if (attempt < attempts) await delay(Math.min(1_000 * 2 ** (attempt - 1), 8_000));
  }
  throw new Error(`Smoke check failed for ${url}: ${lastStatus}.`);
}

export async function waitForWorkerNames(
  workerNames: readonly string[],
  options: {
    readonly attempts?: number;
    readonly list: () => Promise<readonly { readonly id: string }[]>;
    readonly delay?: (ms: number) => Promise<void>;
  }
): Promise<void> {
  const attempts = options.attempts ?? 12;
  const delay = options.delay ?? ((ms: number) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms)));
  let missing = [...workerNames];
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const visible = new Set((await options.list()).map((worker) => worker.id));
      missing = workerNames.filter((workerName) => !visible.has(workerName));
      if (missing.length === 0) return;
      lastError = undefined;
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) await delay(Math.min(1_000 * 2 ** (attempt - 1), 8_000));
  }
  const detail = lastError
    ? String((lastError as Error)?.message ?? lastError)
    : `missing ${missing.join(', ')}`;
  throw new Error(`Cloudflare did not list the deployed Workers: ${detail}.`);
}

async function clearOrphanTags(workerNames: readonly string[]): Promise<void> {
  const credentials = credentialsFromEnvironment();
  const scripts = await listWorkerScripts(credentials);
  const byName = new Map(scripts.map((script) => [script.id, script]));
  await Promise.all(
    workerNames.map(async (workerName) => {
      const script = byName.get(workerName);
      if (!script) throw new Error(`Cloudflare did not list deployed Worker ${workerName}.`);
      const tags = script.tags.filter((tag) => !tag.startsWith(ORPHAN_PREFIX));
      if (tags.length !== script.tags.length) {
        await replaceWorkerTags(credentials, workerName, tags);
      }
    })
  );
}

async function annotate(site: DeployResult, tracker: DeployResult, production: boolean): Promise<void> {
  const commit = process.env.BUILDKITE_COMMIT ?? 'local';
  const body = [
    `### ${production ? 'Wheel production deployment' : 'Wheel branch preview'}`,
    `- Website: ${site.url}`,
    `- Tracker: ${tracker.url}`,
    `- Commit: \`${commit}\``
  ].join('\n');
  if (process.env.BUILDKITE === 'true') {
    await run(
      'buildkite-agent',
      [
        'annotate',
        '--style',
        'success',
        '--context',
        production ? 'wheel-production' : 'wheel-branch-preview'
      ],
      { input: body }
    );
  } else {
    console.log(body);
  }
}

export async function deployBranch(): Promise<void> {
  const credentials = credentialsFromEnvironment();
  const branch = process.env.BUILDKITE_BRANCH;
  if (!branch) throw new Error('BUILDKITE_BRANCH is required.');
  const plan = deploymentPlan(branch);
  const commit = process.env.BUILDKITE_COMMIT ?? 'local';
  const outputDirectory = await mkdtemp(join(tmpdir(), 'wheel-wrangler-'));
  try {
    const [site, tracker] = await Promise.all([
      deployWorker({
        ...plan.site,
        outputDirectory,
        vars: { DEPLOY_COMMIT: commit }
      }),
      deployWorker({ ...plan.tracker, outputDirectory })
    ]);
    await waitForWorkerNames([site.name, tracker.name], {
      list: () => listWorkerScripts(credentials)
    });
    await Promise.all([
      enableWorkersDev(credentials, site.name),
      enableWorkersDev(credentials, tracker.name)
    ]);
    await Promise.all([
      waitForOk(site.url, { expectedCommit: commit }),
      waitForOk(tracker.url),
      waitForOk(`${tracker.url}/readyz`)
    ]);
    await clearOrphanTags([site.name, tracker.name]);
    await annotate(site, tracker, plan.production);
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
}

if (import.meta.main) await deployBranch();
