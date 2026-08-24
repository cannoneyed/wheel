import assert from 'node:assert/strict';
import test from 'node:test';

import {
  sha512Integrity,
  validateInstalledPackages,
  validatePackedFiles,
  validateWheelManifest
} from './package-validation.mjs';

function validManifest() {
  return {
    name: '@cannoneyed/wheel',
    version: '0.1.0',
    publishConfig: {
      access: 'public',
      registry: 'https://registry.npmjs.org/',
      provenance: false,
      tag: 'alpha'
    },
    peerDependencies: {
      'better-sqlite3': '^12.11.1',
      'solid-js': '^1.9.10'
    },
    peerDependenciesMeta: {
      'better-sqlite3': { optional: true }
    },
    exports: {
      './core': { types: './dist/core/index.d.ts', import: './dist/browser/core/index.js' },
      './components/*': { import: './dist/browser/components/*/index.js' },
      './sync/server/cloudflare': { import: './dist/browser/sync/server/cloudflare.js' },
      './sync/server/testing': { import: './dist/browser/sync/server/testing.js' }
    }
  };
}

test('rejects a package name outside the cannoneyed scope', () => {
  const manifest = validManifest();
  manifest.name = 'wheel';
  assert.throws(() => validateWheelManifest(manifest), /Package name must be/);
});

test('rejects a missing or invalid package version', () => {
  const manifest = validManifest();
  delete manifest.version;
  assert.throws(() => validateWheelManifest(manifest), /exact semantic version/);
  manifest.version = 'main';
  assert.throws(() => validateWheelManifest(manifest), /exact semantic version/);
});

test('rejects a release tag that differs from the package version', () => {
  assert.throws(
    () => validateWheelManifest(validManifest(), 'wheel-v0.1.1'),
    /does not match package version/
  );
});

test('rejects package installation lifecycle scripts', () => {
  const manifest = validManifest();
  manifest.scripts = { postinstall: 'node build.mjs' };
  assert.throws(() => validateWheelManifest(manifest), /postinstall lifecycle script/);
});

test('rejects a public export whose target is absent', () => {
  assert.throws(
    () =>
      validatePackedFiles({
        manifest: validManifest(),
        packedPaths: [
          'dist/browser/core/index.js',
          'dist/browser/components/button/index.js',
          'dist/browser/sync/server/cloudflare.js'
        ],
        wildcardValues: { './components/*': ['button'] }
      }),
    /points to missing file/
  );
});

test('rejects source, tests, maps, and build metadata', () => {
  const manifest = validManifest();
  manifest.exports = {};
  for (const path of [
    'src/core/index.ts',
    'dist/core/index.test.js',
    'dist/core/index.js.map',
    'dist/tsconfig.tsbuildinfo'
  ]) {
    assert.throws(
      () => validatePackedFiles({ manifest, packedPaths: [path] }),
      /forbidden files/
    );
  }
  assert.doesNotThrow(() =>
    validatePackedFiles({ manifest, packedPaths: ['dist/core/index.d.ts'] })
  );
});

test('rejects two Wheel roots or two Solid roots', () => {
  const valid = [
    { name: '@cannoneyed/wheel', version: '0.1.0' },
    { name: 'solid-js', version: '1.9.14' }
  ];
  assert.doesNotThrow(() => validateInstalledPackages(valid, '0.1.0'));
  assert.throws(
    () => validateInstalledPackages([...valid, valid[0]], '0.1.0'),
    /one Wheel package root/
  );
  assert.throws(
    () => validateInstalledPackages([...valid, valid[1]], '0.1.0'),
    /one solid-js package root/
  );
});

test('calculates npm SHA-512 integrity', () => {
  assert.equal(
    sha512Integrity(Buffer.from('wheel')),
    'sha512-LH4XrseyyDY/S884rJ8Y1vZF7KhRapgDnfljfzmqw6mAgNqKY7n2JhUi+zw8L/l0o2cFYfPJvv5CRwTENsf1vQ=='
  );
});
