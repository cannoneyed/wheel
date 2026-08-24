import { spawnSync } from 'node:child_process';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sha512Integrity, wheelPackageName } from '../package-validation.mjs';

const registry = 'https://registry.npmjs.org/';
const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const releaseManifestPath = resolve(
  root,
  process.argv[2] ?? '.artifacts/npm/wheel-release.json'
);
const npmCli = resolve(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js');

function npmCommand(args, { cwd = root, env = process.env, allowNotFound = false } = {}) {
  const result = spawnSync(process.execPath, [npmCli, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...env, NO_COLOR: '1', FORCE_COLOR: '0' }
  });
  if (result.status === 0) return result.stdout;
  const output = `${result.stdout}\n${result.stderr}`;
  if (allowNotFound && output.includes('E404')) return undefined;
  throw new Error(
    [`npm ${args[0]} failed`, result.stdout, result.stderr].filter(Boolean).join('\n')
  );
}

function json(text) {
  return JSON.parse(text);
}

function scalar(value) {
  if (Array.isArray(value)) return scalar(value[0]);
  return value;
}

function findStageId(value) {
  if (!value || typeof value !== 'object') return undefined;
  if (typeof value.stageId === 'string') return value.stageId;
  for (const child of Object.values(value)) {
    const stageId = findStageId(child);
    if (stageId) return stageId;
  }
  return undefined;
}

async function stagedIntegrity(stageId, release, npmEnv, temporaryRoot) {
  npmCommand(
    ['stage', 'download', stageId, '--registry', registry],
    { cwd: temporaryRoot, env: npmEnv }
  );
  const safeName = release.package.replace('@', '').replace('/', '-');
  const filename = `${safeName}-${release.version}-${stageId}.tgz`;
  return sha512Integrity(await readFile(join(temporaryRoot, filename)));
}

if (process.versions.node !== '24.19.0') {
  throw new Error(`npm staging requires Node 24.19.0; found ${process.versions.node}.`);
}
const npmVersion = npmCommand(['--version']).trim();
if (npmVersion !== '11.17.0') {
  throw new Error(`npm staging requires npm 11.17.0; found ${npmVersion}.`);
}

const release = json(await readFile(releaseManifestPath, 'utf8'));
if (release.package !== wheelPackageName || !semverPattern.test(release.version)) {
  throw new Error('Release manifest has an unexpected package name or version.');
}
if (release.releaseTag !== `wheel-v${release.version}`) {
  throw new Error('Release manifest tag does not match its version.');
}
if (release.node !== '24.19.0' || release.npm !== '11.17.0') {
  throw new Error('Release artifact used an unexpected Node or npm version.');
}
if (process.env.BUILDKITE_TAG && process.env.BUILDKITE_TAG !== release.releaseTag) {
  throw new Error(`Build tag ${process.env.BUILDKITE_TAG} does not match ${release.releaseTag}.`);
}
if (process.env.BUILDKITE_COMMIT && process.env.BUILDKITE_COMMIT !== release.sourceCommit) {
  throw new Error('Build commit does not match the packaged source commit.');
}

const tarballPath = join(dirname(releaseManifestPath), basename(release.filename));
const localIntegrity = sha512Integrity(await readFile(tarballPath));
if (localIntegrity !== release.integrity) {
  throw new Error('Downloaded tarball does not match the release manifest integrity.');
}

const packageSpec = `${release.package}@${release.version}`;
const publishedOutput = npmCommand(
  ['view', packageSpec, 'dist.integrity', '--json', '--registry', registry],
  { allowNotFound: true }
);
if (publishedOutput !== undefined) {
  const publishedIntegrity = scalar(json(publishedOutput));
  if (publishedIntegrity !== localIntegrity) {
    throw new Error(`${packageSpec} is published with different bytes.`);
  }
  console.log(`${packageSpec} is already published with identical bytes.`);
  console.log(`npm integrity: ${localIntegrity}`);
  process.exit(0);
}

const packageOutput = npmCommand(
  ['view', release.package, 'name', '--json', '--registry', registry],
  { allowNotFound: true }
);
if (packageOutput === undefined) {
  throw new Error(
    `${release.package} does not exist. Publish the first version manually with 2FA.`
  );
}

const token = process.env.NPM_TOKEN;
if (!token) {
  throw new Error('NPM_TOKEN is required to stage an unpublished version.');
}

const temporaryRoot = await mkdtemp(join(tmpdir(), 'wheel-npm-stage-'));
const npmConfigPath = join(temporaryRoot, '.npmrc');
const { NPM_TOKEN: _removedToken, ...environmentWithoutToken } = process.env;
const npmEnv = {
  ...environmentWithoutToken,
  NPM_CONFIG_USERCONFIG: npmConfigPath
};

try {
  await writeFile(
    npmConfigPath,
    `registry=${registry}\n//registry.npmjs.org/:_authToken=${token}\n`,
    { mode: 0o600 }
  );
  await chmod(npmConfigPath, 0o600);

  const staged = json(
    npmCommand(
      ['stage', 'list', release.package, '--json', '--registry', registry],
      { env: npmEnv }
    )
  ).find((item) => item.packageName === release.package && item.version === release.version);

  if (staged) {
    const integrity = await stagedIntegrity(staged.id, release, npmEnv, temporaryRoot);
    if (integrity !== localIntegrity) {
      throw new Error(`${packageSpec} is staged with different bytes.`);
    }
    console.log(`${packageSpec} is already staged with identical bytes.`);
    console.log(`Stage ID: ${staged.id}`);
    console.log(`Approve: npm stage approve ${staged.id}`);
    process.exitCode = 0;
  } else {
    const publishResult = json(
      npmCommand(
        [
          'stage',
          'publish',
          tarballPath,
          '--access',
          'public',
          '--tag',
          'alpha',
          '--json',
          '--registry',
          registry
        ],
        { env: npmEnv }
      )
    );
    let stageId = findStageId(publishResult);
    if (!stageId) {
      const stagedAfterPublish = json(
        npmCommand(
          ['stage', 'list', release.package, '--json', '--registry', registry],
          { env: npmEnv }
        )
      ).find((item) => item.packageName === release.package && item.version === release.version);
      stageId = stagedAfterPublish?.id;
    }
    if (!stageId) {
      throw new Error('npm staged the package but did not return a stage ID.');
    }
    const integrity = await stagedIntegrity(stageId, release, npmEnv, temporaryRoot);
    if (integrity !== localIntegrity) {
      throw new Error(`${packageSpec} was staged with different bytes.`);
    }
    console.log(`Staged ${packageSpec}.`);
    console.log(`Stage ID: ${stageId}`);
    console.log(`Approve: npm stage approve ${stageId}`);
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
