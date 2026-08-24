/**
 * Repo eslint config — wheel's conventions (AGENTS.md) enforced over the
 * kernel and all app code. Run with `bun run lint`.
 *
 * Scoping doctrine (packages/docs/src/pages/linting.mdx): enforcement is
 * DEFAULT-ON for app code. The app layer matches `packages/[*]/src` minus the
 * kernel, so a new package is linted the moment it exists — no glob to forget.
 * Escape hatches are in-file pragmas (`eslint-disable` with a reason,
 * `wheel-connect-surface:`), never directory gaps.
 */
import tsParser from '@typescript-eslint/parser';
import wheel from './packages/wheel/eslint/index.mjs';

const tsLanguageOptions = {
  parser: tsParser,
  ecmaVersion: 2023,
  sourceType: 'module',
  parserOptions: { ecmaFeatures: { jsx: true } }
};

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      // Buildkite mounts Bun's dependency cache inside the checkout. It is
      // installed third-party source, not part of Wheel's lint surface.
      '.cache/**',
      '**/*.tsbuildinfo',
      'cloudflare/worker-configuration.d.ts',
      'packages/docs/dist/**',
      // Sibling git worktrees are parallel checkouts, not source in THIS tree —
      // linting them pulls another branch's in-progress code into this run.
      '.claude/**',
      // No mdx parser configured; prose examples are not linted.
      '**/*.mdx'
    ]
  },

  // Layer 0 — TS parsing for package files OUTSIDE src/ (servers, seeds,
  // jobs, tests at package root). No extra rules; the shared layers below
  // still apply where their globs match.
  {
    files: [
      'packages/*/*.ts',
      'packages/*/{test,seed,jobs,server,browser}/**/*.{ts,tsx}',
      'cloudflare/**/*.{ts,tsx}',
      'scripts/**/*.ts'
    ],
    languageOptions: tsLanguageOptions,
    plugins: { wheel },
    rules: {
      'wheel/invert-return-type': 'error',
      'wheel/no-handles-in-atoms': 'error',
      'wheel/no-unused-imports': 'error',
      // Default-on so a *.server.ts that ever lands outside src/ is covered too;
      // the rule itself only fires on *.server.ts filenames.
      'wheel/no-snake-case-mismatch-in-prune': 'error',
      // Seeds, migrations, and jobs are where hand-written SQL lives — a `$1`
      // in a raw string reaches the driver as written and throws on SQLite.
      'wheel/no-raw-sql-placeholders': 'error',
      // Fires on Wheel consumers and source aliases. The helper enables dev
      // mode, checks local output, and preserves service names.
      'wheel/require-keep-names': 'error'
    }
  },

  // Layer 0b — the 016 behavior contract: every demo browser test names an
  // existing spec row (packages/demos/specs/). The reverse direction (every
  // row has a test) is the specs-coverage vitest suite.
  {
    files: ['packages/demos/browser/**/*.spec.ts'],
    plugins: { wheel },
    rules: {
      'wheel/require-behavior-id': 'error'
    }
  },

  // Layer 1 — library code (the kernel). Documentation rules plus
  // derive-don't-store. NOT connect-only: kernel internals legitimately use
  // the context primitives that rule forbids in app code.
  {
    files: ['packages/wheel/src/**/*.{ts,tsx}'],
    languageOptions: tsLanguageOptions,
    plugins: { wheel },
    rules: {
      'wheel/require-export-jsdoc': 'error',
      'wheel/require-member-jsdoc': 'error',
      'wheel/prefer-computed': 'error',
      'wheel/invert-return-type': 'error',
      'wheel/no-handles-in-atoms': 'error',
      'wheel/no-optional-computed-args': 'error',
      'wheel/no-unused-imports': 'error',
      // The package split's layering DAG (core ← sync ← sync/server; core ← kit;
      // core,sync ← debug; testing ← sync,server,core). Only fires for files
      // under a governed src/<layer>/; barrels and shims resolve to no layer.
      'wheel/no-cross-layer-imports': 'error',
      // Determinism doctrine at edit time (constraints.test enforces it in
      // CI): no raw setTimeout/Date.now/Math.random in src/ — the rule itself
      // exempts runtime-defaults (the one blessed real-time module) and tests.
      'wheel/no-raw-timers': 'error',
      'wheel/no-raw-console': 'error',
      // The URL has one owner. router/history.ts is the seam; everything else
      // navigates through RouterService.
      'wheel/no-raw-location': 'error',
      // Field initializers run BEFORE the constructor body, and `computed`
      // evaluates immediately — so a dependency assigned in the constructor is
      // still undefined when a computed field reads it.
      'wheel/no-early-field-read': 'error',
      'wheel/require-tracked-service-fields': 'error',
      // Color literals follow no theme. Tokens (src/styles/tokens.css) do.
      // var() FALLBACKS stay legal — kit ships into apps that may not have
      // loaded tokens.css. Stylelint enforces the same boundary in CSS.
      'wheel/no-hardcoded-color': 'error',
      'wheel/no-snake-case-mismatch-in-prune': 'error',
      // Only a backend writes placeholders, when it compiles a fragment for
      // its own dialect. A `$n` in raw text is Postgres SQL sent to whatever
      // database is actually there.
      'wheel/no-raw-sql-placeholders': 'error',
      // A service that opens a latest-call-wins session must check the token
      // at every async boundary.
      'wheel/require-latest-async-task-wait': 'error'
    }
  },

  // Layer 1a — the sync client/transport, where teardown is ONE AbortSignal
  // (the 011 async-discipline refactor). Hand-rolled stopped/closed booleans
  // are the pattern that refactor removed; this keeps them from growing back.
  // Widening this glob to sync/server is the checklist for migrating the
  // engine's own `closed` latches.
  {
    files: ['packages/wheel/src/sync/client/**/*.{ts,tsx}'],
    languageOptions: tsLanguageOptions,
    plugins: { wheel },
    rules: {
      'wheel/no-teardown-booleans': 'error'
    }
  },

  // Layer 1b — the kernel's own Solid components model the doctrine.
  {
    files: ['packages/wheel/src/**/*.tsx'],
    languageOptions: tsLanguageOptions,
    plugins: { wheel },
    rules: {
      'wheel/single-connect': 'error',
      'wheel/single-connect-per-file': 'error',
      'wheel/no-whole-service-injection': 'error',
      'wheel/max-connect-surface': 'error',
      'wheel/require-effect-reason': 'error',
      'wheel/require-component-root': 'error',
      'wheel/require-view-root': 'error',
      'wheel/no-directive-on-component': 'error',
      'wheel/require-stable-instance-name': 'error',
      'wheel/require-component-states': 'error',
      'wheel/require-tracked-show': 'error',
      'wheel/no-dev-mode-show': 'error',
      'wheel/require-use-signal': 'error',
      'wheel/require-view-props': 'error',
      'wheel/require-connect-props': 'error',
      'wheel/no-called-view-read': 'error',
      'wheel/no-raw-anchor-navigation': 'error'
    }
  },

  // Layer 2 — app code: every package's src EXCEPT the kernel, so future
  // packages are covered by default. All architecture rules on; JSDoc rules
  // are a library-surface concern and stay off here.
  {
    files: [
      'packages/*/src/**/*.{ts,tsx}',
      // Documentation examples are copied application code. They compile and
      // obey the same architecture rules as a consumer's src/ tree.
      'packages/docs/examples/**/*.{ts,tsx}'
    ],
    ignores: ['packages/wheel/src/**'],
    languageOptions: tsLanguageOptions,
    plugins: { wheel },
    rules: {
      'wheel/single-connect': 'error',
      'wheel/single-connect-per-file': 'error',
      'wheel/connect-only': 'error',
      'wheel/invert-return-type': 'error',
      'wheel/no-handles-in-atoms': 'error',
      'wheel/no-whole-service-injection': 'error',
      'wheel/max-connect-surface': 'error',
      'wheel/require-effect-reason': 'error',
      'wheel/prefer-computed': 'error',
      'wheel/no-optional-computed-args': 'error',
      'wheel/no-barrel-icon-imports': 'error',
      'wheel/require-component-root': 'error',
      'wheel/require-view-root': 'error',
      'wheel/no-directive-on-component': 'error',
      'wheel/require-stable-instance-name': 'error',
      'wheel/require-tracked-show': 'error',
      'wheel/no-dev-mode-show': 'error',
      'wheel/require-use-signal': 'error',
      'wheel/require-view-props': 'error',
      'wheel/require-connect-props': 'error',
      'wheel/no-unused-imports': 'error',
      'wheel/no-called-view-read': 'error',
      // Business code gets no native clock/timer access. TSX may retain
      // presentation-only timing with one adjacent wheel-view-timing reason.
      'wheel/no-raw-timers': ['error', { allowViewTimingReasons: true }],
      'wheel/no-raw-console': 'error',
      // Navigation goes through the router, not the address bar or a bare
      // <a href> that reloads the document.
      'wheel/no-raw-location': 'error',
      'wheel/no-raw-anchor-navigation': 'error',
      // Constructor-assigned dependency read by an eagerly-evaluated field.
      'wheel/no-early-field-read': 'error',
      'wheel/require-tracked-service-fields': 'error',
      // One palette, defined once in tokens.css. A hex typed into a component
      // renders the same in light and dark forever. var() fallbacks are fine.
      'wheel/no-hardcoded-color': 'error',
      // `prune` sees the RAW snake_case row; a camelCase read is always
      // undefined and silently freezes the subscription.
      'wheel/no-snake-case-mismatch-in-prune': 'error',
      // If it takes parameters, it should be a sql`` fragment — then the
      // backend writes the placeholder and dialect is never the app's problem.
      'wheel/no-raw-sql-placeholders': 'error',
      // Opt-in async cancellation stays intact through every await.
      'wheel/require-latest-async-task-wait': 'error'
    }
  },

  // Tests — architecture rules stay ON (tests are not exempt from the
  // doctrine); only the documentation bar is dropped.
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.bun-test.ts'],
    plugins: { wheel },
    rules: {
      'wheel/require-export-jsdoc': 'off',
      'wheel/require-member-jsdoc': 'off',
      // Test files exercise the connect machinery itself — several fixture
      // components per file is the point, not a smell.
      'wheel/single-connect-per-file': 'off',
      // Integration tests legitimately reach across layers — a sync/client test
      // spins up a sync/server engine to drive it. The DAG governs production
      // code, not test scaffolding.
      'wheel/no-cross-layer-imports': 'off'
    }
  }
];
