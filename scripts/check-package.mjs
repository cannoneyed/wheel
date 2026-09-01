import { cp, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';

import {
  releaseTagFor,
  sha512Integrity,
  validateInstalledPackages,
  validatePackedFiles,
  validateWheelManifest
} from './package-validation.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = join(root, 'packages/wheel');
const npmCli = resolve(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js');
const temporaryRoot = await mkdtemp(join(tmpdir(), 'wheel-consumer-'));
const packRoot = join(temporaryRoot, 'pack');
const consumerRoot = join(temporaryRoot, 'consumer');
const { values } = parseArgs({
  options: {
    'output-dir': { type: 'string' }
  },
  strict: true
});
const artifactRoot = values['output-dir'] ? resolve(root, values['output-dir']) : undefined;
const expectedArtifactRoot = join(root, '.artifacts/npm');
if (artifactRoot && artifactRoot !== expectedArtifactRoot) {
  throw new Error(`Package output directory must be ${expectedArtifactRoot}.`);
}
const componentEntries = [
  ['accordion', 'Accordion'],
  ['alert-dialog', 'AlertDialog'],
  ['autocomplete', 'Autocomplete'],
  ['avatar', 'Avatar'],
  ['button', 'Button'],
  ['checkbox', 'Checkbox'],
  ['checkbox-group', 'CheckboxGroup'],
  ['collapsible', 'Collapsible'],
  ['combobox', 'Combobox'],
  ['context-menu', 'ContextMenu'],
  ['dialog', 'Dialog'],
  ['drawer', 'Drawer'],
  ['field', 'Field'],
  ['fieldset', 'Fieldset'],
  ['form', 'Form'],
  ['input', 'Input'],
  ['menu', 'Menu'],
  ['menubar', 'Menubar'],
  ['meter', 'Meter'],
  ['navigation-menu', 'NavigationMenu'],
  ['number-field', 'NumberField'],
  ['otp-field', 'OTPField'],
  ['popover', 'Popover'],
  ['preview-card', 'PreviewCard'],
  ['progress', 'Progress'],
  ['radio', 'Radio'],
  ['radio-group', 'RadioGroup'],
  ['scroll-area', 'ScrollArea'],
  ['select', 'Select'],
  ['separator', 'Separator'],
  ['slider', 'Slider'],
  ['switch', 'Switch'],
  ['tabs', 'Tabs'],
  ['toast', 'Toast'],
  ['toggle', 'Toggle'],
  ['toggle-group', 'ToggleGroup'],
  ['toolbar', 'Toolbar'],
  ['tooltip', 'Tooltip']
];
function run(command, args, cwd, env = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env, NO_COLOR: '1', FORCE_COLOR: '0' }
  });
  if (result.status !== 0) {
    throw new Error(
      [`${command} ${args.join(' ')} failed in ${cwd}`, result.stdout, result.stderr]
        .filter(Boolean)
        .join('\n')
    );
  }
  return result.stdout;
}

function runNpm(args, cwd) {
  return run(process.execPath, [npmCli, ...args], cwd, {
    PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH}`
  });
}

async function write(path, contents) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

async function readPackageRecord(packagePath) {
  try {
    const manifest = JSON.parse(await readFile(join(packagePath, 'package.json'), 'utf8'));
    return { name: manifest.name, version: manifest.version, path: packagePath };
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined;
    throw error;
  }
}

async function installedPackageRecords(nodeModulesPath) {
  const records = [];

  async function visitPackage(packagePath) {
    const record = await readPackageRecord(packagePath);
    if (record) records.push(record);
    try {
      await visitNodeModules(join(packagePath, 'node_modules'));
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }

  async function visitNodeModules(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || (!entry.isDirectory() && !entry.isSymbolicLink())) continue;
      const entryPath = join(path, entry.name);
      if (entry.name.startsWith('@')) {
        for (const scopedEntry of await readdir(entryPath, { withFileTypes: true })) {
          if (!scopedEntry.isDirectory() && !scopedEntry.isSymbolicLink()) continue;
          await visitPackage(join(entryPath, scopedEntry.name));
        }
      } else {
        await visitPackage(entryPath);
      }
    }
  }

  await visitNodeModules(nodeModulesPath);
  return records;
}

try {
  const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
  const releaseTag = process.env.BUILDKITE_TAG || undefined;
  validateWheelManifest(manifest, releaseTag);

  const sourceCommit = run('git', ['rev-parse', 'HEAD'], root).trim();
  if (process.env.BUILDKITE_COMMIT && process.env.BUILDKITE_COMMIT !== sourceCommit) {
    throw new Error(
      `Buildkite commit ${process.env.BUILDKITE_COMMIT} does not match checkout ${sourceCommit}.`
    );
  }

  const npmVersion = runNpm(['--version'], root).trim();
  if (artifactRoot) {
    if (process.versions.node !== '24.19.0') {
      throw new Error(`package:wheel requires Node 24.19.0; found ${process.versions.node}.`);
    }
    if (npmVersion !== '11.17.0') {
      throw new Error(`package:wheel requires npm 11.17.0; found ${npmVersion}.`);
    }
    await rm(artifactRoot, { recursive: true, force: true });
  }

  console.log('package 1/6: build');
  run('bun', ['run', 'build'], packageRoot);

  console.log('package 2/6: pack and inspect');
  await mkdir(packRoot, { recursive: true });
  const packResult = JSON.parse(
    runNpm(['pack', packageRoot, '--json', '--pack-destination', packRoot], root)
  )[0];
  const packedPaths = packResult.files.map((file) => file.path);
  validatePackedFiles({
    manifest,
    packedPaths,
    wildcardValues: {
      './components/*': componentEntries.map(([entry]) => entry)
    }
  });
  for (const path of ['README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'package.json']) {
    if (!packedPaths.includes(path)) {
      throw new Error(`Package is missing ${path}.`);
    }
  }
  for (const path of ['eslint/index.mjs', 'eslint/rules/require-keep-names.mjs']) {
    if (!packedPaths.includes(path)) {
      throw new Error(`Package is missing ${path}.`);
    }
  }
  for (const path of [
    'dist/browser/sync/server/cloudflare.js',
    'dist/node/sync/server/cloudflare.js',
    'dist/sync/server/cloudflare.d.ts',
    'dist/browser/sync/server/testing.js',
    'dist/node/sync/server/testing.js',
    'dist/sync/server/testing.d.ts',
    'dist/node/testing/playwright.js',
    'dist/testing/playwright.d.ts'
  ]) {
    if (!packedPaths.includes(path)) {
      throw new Error(`Package is missing ${path}.`);
    }
  }
  if (packedPaths.includes('dist/browser/testing/playwright.js')) {
    throw new Error('The Playwright harness must remain Node-only.');
  }

  const tarball = join(packRoot, packResult.filename);
  const integrity = sha512Integrity(await readFile(tarball));
  if (packResult.name !== manifest.name || packResult.version !== manifest.version) {
    throw new Error('npm pack returned a different package name or version.');
  }
  if (packResult.integrity !== integrity) {
    throw new Error('npm pack integrity does not match the tarball bytes.');
  }

  console.log('package 3/6: install and import with Node and Bun');
  await write(
    join(consumerRoot, 'package.json'),
    JSON.stringify(
      {
        name: 'wheel-packed-consumer',
        private: true,
        type: 'module',
        dependencies: {
          'solid-js': '^1.9.0',
          wheel: `file:${tarball}`
        }
      },
      null,
      2
    )
  );
  runNpm(['install', '--no-audit', '--no-fund'], consumerRoot);
  await write(
    join(consumerRoot, 'imports.mjs'),
    `const expected = new Map(${JSON.stringify([
      ['auth', 'defineAuthenticator'],
      ['config', 'defineConfig'],
      ['core', 'Service'],
      ['sync', 'collection'],
      ['sync/server', 'createSyncServer'],
      ['sync/server/cloudflare', 'createCloudflareSyncBackend'],
      ['sync/server/testing', 'runBackendConformance'],
      ['kit', 'DialogService'],
      ['components', 'Button'],
      ...componentEntries.map(([entry, name]) => [`components/${entry}`, name]),
      ['router', 'createRouter'],
      ['debug', 'InspectorService'],
      ['testing', 'World'],
      ['testing/playwright', 'createBehaviorHarness'],
      ['vite', 'wheelDevTools']
    ])});
for (const [entry, name] of expected) {
  const module = await import('wheel/' + entry);
  if (!(name in module)) throw new Error('wheel/' + entry + ' does not export ' + name);
}
const eslint = await import('wheel/eslint');
if (!eslint.default?.rules?.['connect-only']) {
  throw new Error('wheel/eslint does not export the Wheel ESLint plugin');
}
`
  );
  await write(
    join(consumerRoot, 'server-smoke.mjs'),
    `import {
  betterSqlite3Driver,
  bunSqliteDriver,
  createSyncServer
} from 'wheel/sync/server';

const driver = typeof globalThis.Bun === 'undefined'
  ? betterSqlite3Driver(':memory:')
  : bunSqliteDriver(':memory:');
const server = await createSyncServer({
  sqlite: { driver },
  syncModules: [],
  servers: []
});
await server.close();
try {
  driver.all('SELECT 1');
  driver.close();
} catch {
  // SyncServer owns backends once EX-06 lands; tolerate that ownership here.
}
`
  );
  run(process.execPath, ['imports.mjs'], consumerRoot);
  run('bun', ['imports.mjs'], consumerRoot);
  run('bun', ['server-smoke.mjs'], consumerRoot);
  const minimalInstallRecords = await installedPackageRecords(join(consumerRoot, 'node_modules'));
  validateInstalledPackages(minimalInstallRecords, manifest.version);
  if (minimalInstallRecords.some((record) => record.name === 'better-sqlite3')) {
    throw new Error('The minimal consumer unexpectedly installed optional peer better-sqlite3.');
  }
  console.log('package: install the optional Node SQLite peer');
  runNpm(
    [
      'install',
      '--no-save',
      `better-sqlite3@${manifest.peerDependencies['better-sqlite3']}`,
      '--no-audit',
      '--no-fund'
    ],
    consumerRoot
  );
  run(process.execPath, ['server-smoke.mjs'], consumerRoot);
  validateInstalledPackages(
    await installedPackageRecords(join(consumerRoot, 'node_modules')),
    manifest.version
  );

  await write(
    join(consumerRoot, 'consumer.ts'),
    `import { defineAuthenticator } from 'wheel/auth';
import { defineConfig, z } from 'wheel/config';
import { Service } from 'wheel/core';
import { collection } from 'wheel/sync';
import { createSyncServer } from 'wheel/sync/server';
import type { DurableObjectStorageLike } from 'wheel/sync/server/cloudflare';
import { runBackendConformance, type ConformanceHarness, type ConformanceTestApi } from 'wheel/sync/server/testing';
import { DialogService } from 'wheel/kit';
import { Button } from 'wheel/components';
import { Accordion } from 'wheel/components/accordion';
import { InspectorService } from 'wheel/debug';
import { World } from 'wheel/testing';
import { createBehaviorHarness } from 'wheel/testing/playwright';
import { wheelDevTools } from 'wheel/vite';

type PublicServerTypes = DurableObjectStorageLike | ConformanceHarness | ConformanceTestApi;

void [defineAuthenticator, defineConfig, z, Service, collection, createSyncServer, runBackendConformance, DialogService, Button, Accordion, InspectorService, World, createBehaviorHarness, wheelDevTools];
void (undefined as PublicServerTypes | undefined);
`
  );
  await write(
    join(consumerRoot, 'router-consumer.ts'),
    `import { buildUrl, createRouter, matchUrl, memoryHistory } from 'wheel/router';

const routes = {
  path: '/',
  children: {
    home: { path: '/' },
    team: {
      path: 'teams/$teamId',
      children: { issues: { path: 'issues' } }
    }
  }
} as const;

const router = createRouter(routes);

// Param inference must survive the packed .d.ts: a missing param is an error.
const url: string = buildUrl(router.table, 'team.issues', {
  params: { teamId: 'core' }
});
const teamId: string | undefined = matchUrl(router.table, url)?.params.teamId;

void [router.Service, router.Root, router.Link, teamId, memoryHistory(['/'])];
`
  );
  await write(
    join(consumerRoot, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          noEmit: true,
          strict: true,
          target: 'ES2022'
        },
        files: ['consumer.ts']
      },
      null,
      2
    )
  );
  run(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'], consumerRoot);
  await write(
    join(consumerRoot, 'tsconfig.router.json'),
    JSON.stringify(
      {
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'Bundler',
          noEmit: true,
          strict: true,
          target: 'ES2022'
        },
        files: ['router-consumer.ts']
      },
      null,
      2
    )
  );
  run(
    process.execPath,
    [join(root, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.router.json'],
    consumerRoot
  );

  console.log('package 4/6: build a Vite browser consumer');
  await write(
    join(consumerRoot, 'index.html'),
    '<div id="app"></div><script type="module" src="/src/main.ts"></script>\n'
  );
  await write(
    join(consumerRoot, 'vite.config.mjs'),
    `import { wheelDevTools } from 'wheel/vite';

export default { plugins: [wheelDevTools()] };
`
  );
  await write(
    join(consumerRoot, 'src/main.ts'),
    `import { defineConfig, z } from 'wheel/config';
import { Service } from 'wheel/core';
import { collection } from 'wheel/sync';
import { DialogService } from 'wheel/kit';
import { Button } from 'wheel/components';
import 'wheel/components/styles';
import { memoryHistory } from 'wheel/router';
import { InspectorService } from 'wheel/debug';

document.querySelector('#app').textContent =
  [defineConfig, z.object, Service, collection, DialogService, Button, memoryHistory, InspectorService]
    .map((value) => value.name)
    .join(',');
`
  );
  run(
    process.execPath,
    [join(root, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', 'vite-dist'],
    consumerRoot
  );
  const browserOutput = await readFile(
    join(consumerRoot, 'vite-dist/index.html'),
    'utf8'
  );
  if (!browserOutput.includes('<script')) {
    throw new Error('Vite consumer did not emit an application script.');
  }

  console.log('package 5/6: build a Cloudflare Worker consumer');
  await write(
    join(consumerRoot, 'cloudflare-worker.ts'),
    `import {
  createCloudflareSyncBackend,
  type DurableObjectStorageLike
} from 'wheel/sync/server/cloudflare';
import { runBackendConformance } from 'wheel/sync/server/testing';

export default {
  fetch(): Response {
    void [createCloudflareSyncBackend, runBackendConformance];
    void (undefined as DurableObjectStorageLike | undefined);
    return new Response('ok');
  }
};
`
  );
  await write(
    join(consumerRoot, 'wrangler.jsonc'),
    `${JSON.stringify(
      {
        name: 'wheel-packed-consumer',
        main: 'cloudflare-worker.ts',
        compatibility_date: '2026-08-24'
      },
      null,
      2
    )}\n`
  );
  run(
    'bun',
    [
      join(root, 'node_modules/wrangler/bin/wrangler.js'),
      'deploy',
      '--dry-run',
      '--config',
      'wrangler.jsonc',
      '--outdir',
      'wrangler-dist'
    ],
    consumerRoot
  );

  console.log('package 6/6: reject a stale local file dependency');
  const fileSourceRoot = join(temporaryRoot, 'wheel-source');
  await mkdir(join(fileSourceRoot, 'scripts'), { recursive: true });
  await cp(join(packageRoot, 'src'), join(fileSourceRoot, 'src'), { recursive: true });
  for (const path of ['package.json', 'tsconfig.json', 'vite.config.ts', 'scripts/fix-declaration-imports.mjs']) {
    await cp(join(packageRoot, path), join(fileSourceRoot, path));
  }
  const consumerManifest = JSON.parse(await readFile(join(consumerRoot, 'package.json'), 'utf8'));
  consumerManifest.dependencies.wheel = `file:${fileSourceRoot}`;
  await write(join(consumerRoot, 'package.json'), `${JSON.stringify(consumerManifest, null, 2)}\n`);
  await write(
    join(consumerRoot, 'stamp-smoke.mjs'),
    `import { wheelDevTools } from 'wheel/vite';
wheelDevTools().config({ root: process.cwd() }, { command: 'serve' });
`
  );
  run(process.execPath, ['stamp-smoke.mjs'], consumerRoot);
  const changedSource = join(fileSourceRoot, 'src/core/dev-mode.ts');
  await write(changedSource, `${await readFile(changedSource, 'utf8')}\n// stale package fixture\n`);
  const stale = spawnSync(process.execPath, ['stamp-smoke.mjs'], {
    cwd: consumerRoot,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' }
  });
  if (stale.status === 0 || !`${stale.stdout}\n${stale.stderr}`.includes('Wheel package output is stale')) {
    throw new Error('Stale local Wheel source did not fail through wheelDevTools().');
  }

  if (artifactRoot) {
    await mkdir(artifactRoot, { recursive: true });
    await cp(tarball, join(artifactRoot, packResult.filename));
    await write(
      join(artifactRoot, 'wheel-release.json'),
      `${JSON.stringify(
        {
          package: manifest.name,
          version: manifest.version,
          releaseTag: releaseTagFor(manifest.version),
          sourceCommit,
          filename: packResult.filename,
          integrity,
          shasum: packResult.shasum,
          size: packResult.size,
          node: process.versions.node,
          npm: npmVersion
        },
        null,
        2
      )}\n`
    );
    console.log(`package: ${manifest.name}@${manifest.version}`);
    console.log(`package: source ${sourceCommit}`);
    console.log(`package: file ${packResult.filename}`);
    console.log(`package: integrity ${integrity}`);
  }

  console.log(`package: passed (${packResult.entryCount} files, ${packResult.unpackedSize} bytes unpacked)`);
} finally {
  if (process.env.KEEP_WHEEL_CONSUMER_TMP === '1') {
    console.log(`package: kept ${temporaryRoot}`);
  } else {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}
