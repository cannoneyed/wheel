import { createHash } from 'node:crypto';

export const wheelPackageName = '@cannoneyed/wheel';

const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;

export function releaseTagFor(version) {
  return `wheel-v${version}`;
}

export function validateWheelManifest(manifest, releaseTag) {
  if (manifest.name !== wheelPackageName) {
    throw new Error(`Package name must be ${wheelPackageName}.`);
  }
  if (typeof manifest.version !== 'string' || !semverPattern.test(manifest.version)) {
    throw new Error('Package version must be an exact semantic version.');
  }
  if (releaseTag !== undefined && releaseTag !== releaseTagFor(manifest.version)) {
    throw new Error(
      `Release tag ${releaseTag} does not match package version ${manifest.version}.`
    );
  }
  if (manifest.private === true) {
    throw new Error('The Wheel package must not be private.');
  }
  if (manifest.publishConfig?.access !== 'public') {
    throw new Error('publishConfig.access must be public.');
  }
  if (manifest.publishConfig?.registry !== 'https://registry.npmjs.org/') {
    throw new Error('publishConfig.registry must be https://registry.npmjs.org/.');
  }
  if (manifest.publishConfig?.provenance !== false) {
    throw new Error('publishConfig.provenance must be false for Buildkite.');
  }
  if (manifest.publishConfig?.tag !== 'alpha') {
    throw new Error('publishConfig.tag must be alpha.');
  }
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare']) {
    if (manifest.scripts?.[lifecycle]) {
      throw new Error(`Package must not define a ${lifecycle} lifecycle script.`);
    }
  }
  if (manifest.dependencies?.['solid-js'] || !manifest.peerDependencies?.['solid-js']) {
    throw new Error('solid-js must be a peer dependency, not a package dependency.');
  }
  if (
    manifest.dependencies?.['better-sqlite3'] ||
    !manifest.peerDependencies?.['better-sqlite3'] ||
    manifest.peerDependenciesMeta?.['better-sqlite3']?.optional !== true
  ) {
    throw new Error('better-sqlite3 must be an optional peer dependency.');
  }
  for (const entry of ['./sync/server/cloudflare', './sync/server/testing']) {
    if (!manifest.exports?.[entry]) {
      throw new Error(`Package exports must include ${entry}.`);
    }
  }
}

function exportTargets(value) {
  if (typeof value === 'string') return [value];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.values(value).flatMap(exportTargets);
}

const forbiddenPackagePaths = [
  /(^|\/)(src|test|tests|__tests__|scripts)(\/|$)/,
  /(^|\/)\.git(?:ignore|attributes)?$/,
  /(^|\/)\.npmrc$/,
  /(^|\/)\.env(?:\.|$)/,
  /(^|\/)(?:bun\.lockb?|package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/,
  /(?:^|\/)tsconfig(?:\.[^/]+)?\.json$/,
  /(?:^|\/)vite\.config\.[cm]?[jt]s$/,
  /\.test(?:-d)?\.[cm]?[jt]sx?$/,
  /\.map$/,
  /\.tsbuildinfo$/,
  /(?<!\.d)\.ts$/,
  /\.tsx$/
];

export function validatePackedFiles({ manifest, packedPaths, wildcardValues = {} }) {
  const files = new Set(packedPaths);
  const forbidden = packedPaths.filter((path) =>
    forbiddenPackagePaths.some((pattern) => pattern.test(path))
  );
  if (forbidden.length > 0) {
    throw new Error(`Package contains forbidden files:\n${forbidden.join('\n')}`);
  }

  for (const [exportName, conditions] of Object.entries(manifest.exports ?? {})) {
    const replacements = exportName.includes('*') ? wildcardValues[exportName] : [undefined];
    if (!replacements || replacements.length === 0) {
      throw new Error(`No packed-file values were supplied for wildcard export ${exportName}.`);
    }
    for (const replacement of replacements) {
      for (const target of exportTargets(conditions)) {
        if (!target.startsWith('./')) {
          throw new Error(`Public export ${exportName} has invalid target ${target}.`);
        }
        const path = target.slice(2).replaceAll('*', replacement ?? '');
        if (!files.has(path)) {
          throw new Error(`Public export ${exportName} points to missing file ${path}.`);
        }
      }
    }
  }
}

export function validateInstalledPackages(records, expectedVersion) {
  const wheel = records.filter((record) => record.name === wheelPackageName);
  if (wheel.length !== 1) {
    throw new Error(`Clean consumer must contain one Wheel package root; found ${wheel.length}.`);
  }
  if (wheel[0].version !== expectedVersion) {
    throw new Error(
      `Clean consumer installed Wheel ${wheel[0].version}; expected ${expectedVersion}.`
    );
  }

  const solid = records.filter((record) => record.name === 'solid-js');
  if (solid.length !== 1) {
    throw new Error(`Clean consumer must contain one solid-js package root; found ${solid.length}.`);
  }
}

export function sha512Integrity(bytes) {
  return `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
}
