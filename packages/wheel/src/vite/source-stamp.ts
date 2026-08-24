/**
 * The deterministic source stamp used by Wheel's package build and Vite
 * helper. A direct file consumer compares this value with its built helper.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT_INPUTS = [
  'package.json',
  'tsconfig.json',
  'vite.config.ts',
  'scripts/fix-declaration-imports.mjs'
] as const;

function sourceFiles(root: string): string[] {
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else files.push(path);
    }
  };
  visit(join(root, 'src'));
  return files;
}

/** Return the package version plus a hash of every Wheel build input. */
export function wheelSourceStamp(packageRoot: string): string {
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
    version?: unknown;
  };
  if (typeof manifest.version !== 'string') {
    throw new Error(`Wheel package at ${packageRoot} has no string version.`);
  }

  const paths = [
    ...ROOT_INPUTS.map((path) => join(packageRoot, path)),
    ...sourceFiles(packageRoot)
  ].sort((left, right) => relative(packageRoot, left).localeCompare(relative(packageRoot, right)));
  const hash = createHash('sha256');
  for (const path of paths) {
    hash.update(relative(packageRoot, path));
    hash.update('\0');
    hash.update(readFileSync(path));
    hash.update('\0');
  }
  return `${manifest.version}:${hash.digest('hex').slice(0, 16)}`;
}
