/**
 * WHY THIS RULE EXISTS (the split only holds if imports can't climb back up):
 *
 * The 011 cleanup cut one package into layered surfaces that form a one-way
 * dependency graph — each layer may only reach DOWN to the ones it's built on:
 *
 *   auth          ← provider-neutral trust contracts; depends on nothing internal
 *   config        ← JSON application boot configuration; depends on nothing internal
 *   core          ← the service kernel; depends on nothing internal
 *   components    ← accessible UI primitives; may use core (they are components
 *                   OF wheel apps, and register into the same component tree)
 *   router        ← may use core ONLY (RouterService is a Service like any other)
 *   sync          ← may use core
 *   sync/server   ← may use sync, core
 *   kit           ← may use core and components (never sync — verified per file)
 *   debug         ← may use core, sync (it renders the client's surfaces)
 *   annotate      ← may use core, sync, debug (it reuses the picker and capture)
 *   testing       ← may use sync, sync/server, core
 *
 * Nothing in the type system enforces the arrows. A `core/` file that writes
 * `import { liveQuery } from '../sync/x'`, or a `kit/` file that reaches into
 * `sync`, compiles fine — and silently re-welds the coupling the split spent
 * effort removing. It reads as harmless; the damage is that `core` can no
 * longer ship or be reasoned about without `sync`, and the DAG that made
 * `wheel/core` a real standalone surface is quietly gone.
 *
 *   // in packages/wheel/src/core/services.ts
 *   import { LiveClient } from '../sync/client/client';   // ❌ core → sync, climbs UP
 *
 *   // in packages/wheel/src/kit/dialog.tsx
 *   import { liveQuery } from '../sync/declarations';     // ❌ kit → sync, not an allowed edge
 *
 *   // in packages/wheel/src/sync/sync-service.ts
 *   import { connect } from '../core/connect';            // ✅ sync → core, an allowed DOWN edge
 *
 * The pain shows up nowhere at compile time and everywhere later: the moment
 * someone tries to extract `wheel/core` (or just import it without pulling the
 * world in), the stray up-edge surfaces as a dependency that shouldn't exist.
 * This rule turns every up-edge into a lint error the instant it's written,
 * naming the source layer, the target layer, and which edges the source may use.
 *
 * Scope: only files under `packages/wheel/src/<layer>/` are governed. The old
 * aggregate barrels (`src/index.ts`, `src/solid/`, `src/server/`) are NOT a
 * layer — they re-export across surfaces on purpose and the codemod deletes
 * them, so they resolve to no layer and are skipped. Test files import across
 * layers to set up integration scenarios (a `sync/client` test spinning up a
 * `sync/server` engine); the rule is turned OFF for `*.test.*` in the repo
 * config rather than special-cased here.
 */
import path from 'node:path';

/** Marker that appears once in every governed file path; text after it is layer-relative. */
const SRC_MARKER = 'packages/wheel/src/';

/**
 * Classify a src-relative path into its layer, or null if it's not under one.
 * `sync/server` must be tested before `sync` — it's the nested, more specific case.
 */
function layerOf(srcRelPath) {
  const p = srcRelPath.replace(/\\/g, '/');
  if (p === 'sync/server' || p.startsWith('sync/server/')) return 'sync/server';
  if (p.startsWith('auth/')) return 'auth';
  if (p.startsWith('config/')) return 'config';
  if (p.startsWith('sync/')) return 'sync';
  if (p.startsWith('core/')) return 'core';
  if (p.startsWith('components/')) return 'components';
  if (p.startsWith('kit/')) return 'kit';
  if (p.startsWith('router/')) return 'router';
  if (p.startsWith('debug/')) return 'debug';
  if (p.startsWith('annotate/')) return 'annotate';
  if (p.startsWith('testing/')) return 'testing';
  return null;
}

/**
 * For each layer, the set of OTHER layers it may import (the allowed DOWN edges).
 * Same-layer imports are always allowed and never appear here. Any target layer
 * not in a source's set is an up-edge and gets flagged.
 */
const ALLOWED_EDGES = {
  auth: new Set([]),
  config: new Set([]),
  core: new Set([]),
  // components → core is a DOWN edge, not a cycle: core never imports
  // components. The leaf status was a bet that `wheel/components` might ship
  // standalone one day; the batteries-included design says otherwise, and the
  // cost of the bet was that the library's own parts were the one thing in a
  // wheel app the component tree could not see.
  components: new Set(['core']),
  router: new Set(['core']),
  sync: new Set(['core']),
  'sync/server': new Set(['auth', 'sync', 'core']),
  kit: new Set(['core', 'components']),
  debug: new Set(['core', 'sync']),
  annotate: new Set(['core', 'sync', 'debug']),
  testing: new Set(['sync', 'sync/server', 'core'])
};

/** Bare `wheel/<subpath>` specifiers → layer. Aggregate/shim entries map to null (skipped). */
const WHEEL_SUBPATH_LAYER = {
  'wheel/auth': 'auth',
  'wheel/config': 'config',
  'wheel/core': 'core',
  'wheel/components': 'components',
  'wheel/sync': 'sync',
  'wheel/sync/server': 'sync/server',
  'wheel/kit': 'kit',
  'wheel/router': 'router',
  'wheel/debug': 'debug',
  'wheel/annotate': 'annotate',
  'wheel/testing': 'testing'
};

/** Human-readable list of a layer's allowed targets, for the error message. */
function allowedList(layer) {
  const set = ALLOWED_EDGES[layer];
  const items = [layer, ...set]; // self is always allowed
  return items.join(', ');
}

/**
 * Resolve an import specifier to its target layer.
 * - relative (`./`, `../`): resolved against the importing file's src-relative dir.
 * - `wheel/<subpath>`: mapped directly.
 * - anything else (node_modules, aliases): returns null (not governed).
 */
function targetLayerOf(spec, srcRelFileDir) {
  if (spec.startsWith('.')) {
    const joined = path.posix.normalize(path.posix.join(srcRelFileDir, spec));
    // A resolved path that climbs out of src (starts with `..`) isn't a layer.
    if (joined.startsWith('..')) return null;
    return layerOf(joined);
  }
  if (spec === 'wheel' || spec.startsWith('wheel/')) {
    if (spec.startsWith('wheel/components/')) return 'components';
    return WHEEL_SUBPATH_LAYER[spec] ?? null;
  }
  return null;
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'enforce the wheel layering DAG — independent auth/config leaves; core ← components,router,sync ← sync/server; core,components ← kit; core,sync ← debug'
    },
    messages: {
      upEdge:
        "Layer violation: `{{from}}` may not import from `{{to}}` — that climbs UP the dependency DAG. `{{from}}` may only import from: {{allowed}}. Move the shared code down into a layer `{{from}}` is allowed to reach, or reconsider whether this belongs in `{{from}}` at all."
    },
    schema: []
  },
  create(context) {
    const filename = (context.filename ?? context.getFilename?.() ?? '').replace(/\\/g, '/');
    const idx = filename.indexOf(SRC_MARKER);
    // Not a file under packages/wheel/src — nothing to govern.
    if (idx === -1) return {};
    const srcRelFile = filename.slice(idx + SRC_MARKER.length);
    const fromLayer = layerOf(srcRelFile);
    // File isn't inside a governed layer (aggregate barrel / shim / src-root file).
    if (fromLayer === null) return {};
    const srcRelFileDir = path.posix.dirname(srcRelFile);
    const allowed = ALLOWED_EDGES[fromLayer];

    /** Check one import/export source string node. */
    const check = (sourceNode) => {
      if (!sourceNode || typeof sourceNode.value !== 'string') return;
      const toLayer = targetLayerOf(sourceNode.value, srcRelFileDir);
      if (toLayer === null) return; // ungoverned target (node_modules, out-of-src, aggregate)
      if (toLayer === fromLayer) return; // same-layer imports are always fine
      if (allowed.has(toLayer)) return; // an allowed DOWN edge
      context.report({
        node: sourceNode,
        messageId: 'upEdge',
        data: { from: fromLayer, to: toLayer, allowed: allowedList(fromLayer) }
      });
    };

    return {
      ImportDeclaration(node) {
        check(node.source);
      },
      // `export { x } from '...'` and `export * from '...'` are import edges too —
      // the barrels are built entirely of them, so they must be governed identically.
      ExportNamedDeclaration(node) {
        check(node.source);
      },
      ExportAllDeclaration(node) {
        check(node.source);
      }
    };
  }
};
