/**
 * The package's standing rules, enforced as tests so they run in
 * CI from day one (the lint lesson: a rule that isn't wired
 * into CI doesn't exist).
 *
 * (The wheel eslint plugin — eslint/ — enforces the AGENTS.md style
 * rules; these tests enforce the runtime-shaped rules below.)
 *
 *  - determinism: no bare Date.now/Math.random/new Date()/setTimeout/setInterval
 *    in src/ outside sync/runtime-defaults.ts
 *  - browser safety: client-safe public layers never import node builtins, a
 *    DB driver, or any *.server module
 *  - extraction health: src/ and demos/ never import Surface app code
 *  - demos never use sql.dangerous
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, test } from 'vitest';

const packageRoot = join(__dirname, '..');

function listFiles(root: string): string[] {
  const files: string[] = [];
  let rootStat;
  try {
    rootStat = statSync(root);
  } catch {
    return files;
  }
  if (!rootStat.isDirectory()) return files;
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        if (entry === 'node_modules' || entry === 'dist') continue;
        walk(path);
      } else if (/\.(ts|tsx)$/.test(entry)) {
        files.push(path);
      }
    }
  };
  walk(root);
  return files;
}

const srcFiles = listFiles(join(packageRoot, 'src'));
const demoFiles = listFiles(join(packageRoot, 'demos'));

const rel = (path: string): string => relative(packageRoot, path);
const isTestFile = (path: string): boolean => /\.test\.(ts|tsx)$/.test(path);

describe('determinism doctrine', () => {
  const BANNED = [/\bDate\.now\(/, /\bMath\.random\(/, /\bnew Date\(\)/, /\bsetTimeout\(/, /\bsetInterval\(/];

  test('src/ never touches real time or randomness outside runtime-defaults', () => {
    const offenders: string[] = [];
    for (const file of srcFiles) {
      // ONE exemption: runtime-defaults is THE blessed real-time module. (The
      // The network transport used to be exempt too; its backoff now runs through the
      // injected retryForever/Defer seam, so the exemption is gone — keep it
      // gone.)
      if (
        isTestFile(file) ||
        file.endsWith('core/runtime-defaults.ts') ||
        file.endsWith('components/base-utils/runtime.ts')
      ) continue;
      const content = readFileSync(file, 'utf8');
      for (const pattern of BANNED) {
        if (pattern.test(content)) {
          offenders.push(`${rel(file)} matches ${pattern}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('browser safety', () => {
  const CLIENT_DIRS = [
    'src/auth/',
    'src/config/',
    'src/core/',
    'src/components/',
    'src/sync/',
    'src/kit/',
    'src/router/',
    'src/debug/'
  ];
  // sync/server is the node engine — it OWNS the drivers, so it is the one
  // sub-tree carved out of the otherwise browser-safe `sync` layer.
  const SERVER_DIR = 'src/sync/server/';
  const BANNED_IMPORTS = [/from\s+'node:/, /from\s+'postgres'/, /from\s+'@electric-sql\/pglite'/, /from\s+'[^']*\.server(\.js)?'/];

  test('client-safe directories never import node builtins, drivers, or *.server modules', () => {
    const offenders: string[] = [];
    for (const file of srcFiles) {
      if (isTestFile(file)) continue;
      const relative = rel(file);
      if (relative.startsWith(SERVER_DIR)) continue;
      if (!CLIENT_DIRS.some((dir) => relative.startsWith(dir)) && relative !== 'src/index.ts') continue;
      const content = readFileSync(file, 'utf8');
      for (const pattern of BANNED_IMPORTS) {
        if (pattern.test(content)) {
          offenders.push(`${relative} matches ${pattern}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('extraction health', () => {
  test('the library never imports Surface app code', () => {
    // Fully extracted as `wheel`: no `@surface/*` import may exist at all (the
    // old carve-out for the library's own `@surface/live-state` package is moot).
    const banned = /from\s+'@surface\//;
    const offenders: string[] = [];
    for (const file of srcFiles) {
      if (banned.test(readFileSync(file, 'utf8'))) {
        offenders.push(rel(file));
      }
    }
    for (const file of demoFiles) {
      if (banned.test(readFileSync(file, 'utf8'))) {
        offenders.push(rel(file));
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('demo discipline', () => {
  test('demos never use sql.dangerous', () => {
    const offenders = demoFiles.filter((file) => /sql\.dangerous/.test(readFileSync(file, 'utf8')));
    expect(offenders.map(rel)).toEqual([]);
  });
});
