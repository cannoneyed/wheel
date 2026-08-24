/**
 * Direct file dependency validation for wheelDevTools(). Registry and tarball
 * packages have no local source tree, so they do not enter this check.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { wheelSourceStamp } from './source-stamp';

interface ConsumerManifest {
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
  readonly optionalDependencies?: Record<string, string>;
}

function wheelSpec(manifest: ConsumerManifest): string | undefined {
  return (
    manifest.dependencies?.wheel ??
    manifest.devDependencies?.wheel ??
    manifest.optionalDependencies?.wheel
  );
}

function filePackageRoot(spec: string, consumerRoot: string): string | null {
  if (!spec.startsWith('file:')) return null;
  const path = spec.startsWith('file://')
    ? fileURLToPath(spec)
    : resolve(consumerRoot, decodeURIComponent(spec.slice('file:'.length)));
  if (!existsSync(path) || !statSync(path).isDirectory()) return null;
  return path;
}

/** Throw when a direct file dependency's source does not match this built helper. */
export function assertFreshWheelFileDependency(
  consumerRoot: string,
  builtStamp: string | null
): void {
  const manifestPath = resolve(consumerRoot, 'package.json');
  if (!existsSync(manifestPath)) return;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ConsumerManifest;
  const spec = wheelSpec(manifest);
  if (!spec) return;
  const packageRoot = filePackageRoot(spec, consumerRoot);
  if (!packageRoot) return;
  if (builtStamp === null) {
    throw new Error(
      `wheel/vite has no build stamp for ${spec}. Run \`bun run --cwd ${JSON.stringify(packageRoot)} build\`, then reinstall wheel.`
    );
  }
  const currentStamp = wheelSourceStamp(packageRoot);
  if (currentStamp === builtStamp) return;
  throw new Error(
    `Wheel package output is stale for ${spec}. Built from ${builtStamp}; source is ${currentStamp}. ` +
      `Run \`bun run --cwd ${JSON.stringify(packageRoot)} build\`, then reinstall wheel.`
  );
}
