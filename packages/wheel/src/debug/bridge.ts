/**
 * The agent bridge: `window.__wheel` — wheel's programmatic door for driving
 * a running app from OUTSIDE the page (playwright `page.evaluate`, the
 * browser console, any agent tool that can execute JS in the tab).
 *
 * What it exposes, and the doctrine behind each choice:
 *
 * - READS: the full state tree (`state()`), the mounted component tree
 *   (`components()`), per-instance live props/local/connect state
 *   (`component(id)`), the client's
 *   table cache and provenance stream (`tables()`, `writes()`). Everything
 *   returns plain JSON — serialized with depth/size caps so a `page.evaluate`
 *   round trip can't explode on a big app.
 * - WRITES: `act()` (a mounted instance's shape action) and `actService()`
 *   (a service action by name). Actions are the ONLY write door — the bridge
 *   deliberately has no `setAtom`. Unidirectional flow applies to agents
 *   exactly as it applies to components: if an agent needs to force a state,
 *   it calls the action that produces it (or the playground mounts the
 *   component with a stubbed shape).
 * - `settle()`: resolves when the sync client is quiet (no pending
 *   mutations, connected) — the programmatic version of "wait for the
 *   inflight chip to clear". Event-driven off the client's change channel;
 *   no polling.
 * - `errors()`: the captured-error buffer (see error-capture; empty until an
 *   ErrorService is mounted). ALWAYS check this first when the app looks
 *   wrong — it is the fastest "what broke" read in the box.
 * - `highlight()`: outlines an instance on the page (the inspector's
 *   zero-layout-shift outline) — lets an agent show a human what it means.
 *
 * Installation is dev-gated (`isWheelDevMode`) — a production bundle never
 * grows a global. Multiple wheel apps on one page (docs embeds) each install
 * under their own id: `__wheel.apps()` lists them, `__wheel.app(id)` picks
 * one, and every top-level method proxies to the sole app when only one is
 * mounted.
 *
 * Selector cheat sheet (also stamped on the DOM in dev as `data-wheel-id`):
 * instance ids are live-slot stable — `TodoRow` for the first mounted
 * TodoRow, `TodoRow#2` for a concurrent second, `card:42` when the component
 * uses a per-instance connect name (the stable form lint prefers).
 */
import type { SyncClient } from '../sync/client/client';
import type { WheelContextValue } from '../core/context';
import type { DebugRegistry, InstanceRecord } from '../core/debug-registry';
import type {
  BridgeActResult,
  BridgeComponentSummary,
  BridgeErrorEntry,
  BridgeMeta,
  BridgeRect,
  WheelBridgeApp,
  WheelGlobal
} from '../core/bridge-contract';
import { isWheelDevMode } from '../core/dev-mode';

import { InspectorService } from './inspector';
import { activeErrorLog } from './error-capture';

export type {
  BridgeActResult,
  BridgeComponentDetail,
  BridgeComponentSummary,
  BridgeErrorEntry,
  BridgeMeta,
  BridgeRect,
  BridgeServiceState,
  WheelBridgeApp,
  WheelGlobal
} from '../core/bridge-contract';

const SERIALIZE_DEPTH = 6;
const SERIALIZE_KEYS = 100;
const SERIALIZE_STRING = 500;

/**
 * Best-effort JSON projection: bounded depth, bounded fan-out, truncated
 * strings, Map/Set flattened, functions and circulars named instead of
 * followed. The bridge trades perfect fidelity for "always returns, always
 * serializable".
 */
function serializeValue(value: unknown, depth = SERIALIZE_DEPTH, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return null;
  const type = typeof value;
  if (type === 'string') {
    const text = value as string;
    return text.length > SERIALIZE_STRING ? `${text.slice(0, SERIALIZE_STRING)}…(${text.length} chars)` : text;
  }
  if (type === 'number' || type === 'boolean') return value;
  if (type === 'bigint') return `${String(value)}n`;
  if (type === 'function') return `<fn ${(value as { name?: string }).name || 'anonymous'}>`;
  if (type !== 'object') return String(value);
  const obj = value as object;
  if (seen.has(obj)) return '<circular>';
  if (depth <= 0) return Array.isArray(obj) ? `<array ${obj.length}>` : '<object>';
  seen.add(obj);
  try {
    if (Array.isArray(obj)) {
      const head = obj.slice(0, SERIALIZE_KEYS).map((item) => serializeValue(item, depth - 1, seen));
      if (obj.length > SERIALIZE_KEYS) head.push(`…+${obj.length - SERIALIZE_KEYS} more`);
      return head;
    }
    if (obj instanceof Set) return serializeValue([...obj], depth, seen);
    if (obj instanceof Map) {
      return serializeValue(Object.fromEntries([...obj.entries()].map(([k, v]) => [String(k), v])), depth, seen);
    }
    const out: Record<string, unknown> = {};
    let count = 0;
    for (const [key, nested] of Object.entries(obj)) {
      if (count >= SERIALIZE_KEYS) {
        out['…'] = 'truncated';
        break;
      }
      out[key] = serializeValue(nested, depth - 1, seen);
      count += 1;
    }
    return out;
  } finally {
    seen.delete(obj);
  }
}

function rectOf(elements: ReadonlySet<Element>): { rect: BridgeRect | null; rects: BridgeRect[] } {
  const rects: BridgeRect[] = [];
  for (const element of elements) {
    if (!element.isConnected) continue;
    const r = element.getBoundingClientRect();
    rects.push({ x: r.x, y: r.y, width: r.width, height: r.height });
  }
  if (rects.length === 0) return { rect: null, rects };
  const left = Math.min(...rects.map((r) => r.x));
  const top = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.width));
  const bottom = Math.max(...rects.map((r) => r.y + r.height));
  return { rect: { x: left, y: top, width: right - left, height: bottom - top }, rects };
}

function summarize(record: InstanceRecord, registry: DebugRegistry): BridgeComponentSummary {
  return {
    instanceId: record.instanceId,
    name: record.name,
    kind: record.kind,
    // Containment-derived, matching the tree — the recorded owner hint lies
    // in production builds (siblings share owners).
    parentId: registry.displayParentId(record),
    rect: rectOf(record.elements).rect
  };
}

async function invokeSafely(fn: () => unknown): Promise<BridgeActResult> {
  try {
    const result = await fn();
    return { ok: true, result: serializeValue(result) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
  }
}

/** @internal Error feed seam — the error-capture module plugs in per app id. */
export const bridgeErrorFeeds = new Map<string, () => BridgeErrorEntry[]>();

function makeAppBridge(appId: string, context: WheelContextValue): WheelBridgeApp {
  const { services } = context;
  const registry = services.registry;
  // Same narrowing move the debug panel makes: debug is allowed to know sync.
  const client = context.client as SyncClient | null;

  const meta = (): BridgeMeta => ({
    appId,
    scopeId: services.scopeId,
    seq: client?.seq() ?? 0,
    pending: client?.pendingMutations() ?? 0,
    status: client?.connectionStatus() ?? 'offline',
    instances: registry.instances().length
  });

  return {
    meta,
    state() {
      const snapshot = registry.snapshot();
      const byId = new Map(snapshot.primitives.map((entry) => [entry.meta.id, entry] as const));
      return snapshot.services.map((service) => ({
        service: service.name,
        scopeId: service.scopeId,
        group: service.group,
        primitives: service.primitiveIds.flatMap((id) => {
          const entry = byId.get(id);
          return entry
            ? [{ id, name: entry.meta.name, kind: entry.meta.kind, value: serializeValue(entry.value) }]
            : [];
        })
      }));
    },
    components() {
      return registry.instanceTree();
    },
    component(instanceId) {
      const record = registry.instance(instanceId);
      if (!record) return null;
      const { rect, rects } = rectOf(record.elements);
      return {
        ...summarize(record, registry),
        rect,
        rects,
        props: serializeValue(record.props()) as Record<string, unknown>,
        locals: serializeValue(
          Object.fromEntries(record.locals.map((local) => [local.name, local.read()]))
        ) as Record<string, unknown>,
        state: serializeValue(record.state()) as Record<string, unknown>,
        actions: record.actions
      };
    },
    find(query) {
      const needle = query.toLowerCase();
      return registry
        .instances()
        .filter(
          (record) =>
            record.instanceId.toLowerCase().includes(needle) || record.name.toLowerCase().includes(needle)
        )
        .map((record) => summarize(record, registry));
    },
    act(instanceId, action, args = []) {
      const record = registry.instance(instanceId);
      if (!record) {
        const near = registry
          .instances()
          .filter((r) => r.name === instanceId || r.instanceId.startsWith(instanceId))
          .map((r) => r.instanceId);
        return Promise.resolve({
          ok: false,
          error: `no mounted instance '${instanceId}'${near.length ? ` — did you mean: ${near.join(', ')}` : ''}`
        });
      }
      return invokeSafely(() => record.invoke(action, args));
    },
    actService(serviceName, actionName, args = []) {
      const matches = registry.findActions(serviceName, actionName);
      if (matches.length === 0) {
        return Promise.resolve({
          ok: false,
          error: `no action '${serviceName}.${actionName}' — see actions() for the catalog`
        });
      }
      if (matches.length > 1) {
        return Promise.resolve({
          ok: false,
          error: `'${serviceName}.${actionName}' is mounted in ${matches.length} scopes (${matches
            .map((m) => m.serviceId)
            .join(', ')}) — use act() on a specific instance instead`
        });
      }
      return invokeSafely(() => matches[0].invoke(...args));
    },
    actions() {
      const snapshot = registry.snapshot();
      const serviceNames = new Map(snapshot.services.map((s) => [s.id, s.name] as const));
      return snapshot.primitives
        .filter((entry) => entry.meta.kind === 'action')
        .map((entry) => ({
          service: entry.meta.serviceName ?? serviceNames.get(entry.meta.serviceId ?? '') ?? '',
          action: entry.meta.name,
          id: entry.meta.id,
          serviceId: entry.meta.serviceId ?? ''
        }));
    },
    tables() {
      return (client?.tablesDebug() ?? []).map((entry) => ({
        table: entry.table,
        rows: serializeValue(entry.rows) as Record<string, unknown>[]
      }));
    },
    writes(limit = 30) {
      return (client?.recentWrites(limit) ?? []).map(
        (entry) => serializeValue(entry) as Record<string, unknown>
      );
    },
    errors() {
      const feed = bridgeErrorFeeds.get(appId);
      if (feed) return feed();
      return [...(activeErrorLog()?.entries() ?? [])];
    },
    highlight(instanceId) {
      services.get(InspectorService).highlight(instanceId);
    },
    settle(timeoutMs = 5000) {
      const quiet = (): boolean =>
        client === null || (client.pendingMutations() === 0 && client.connectionStatus() === 'connected');
      if (quiet()) {
        return Promise.resolve({ settled: true, ...meta() });
      }
      return new Promise((resolve) => {
        // Event-driven: re-check on every client change; the injected defer
        // seam provides the timeout (no raw timers in src/).
        let done = false;
        const finish = (settled: boolean): void => {
          if (done) return;
          done = true;
          release();
          cancel();
          resolve({ settled, ...meta() });
        };
        const release = client!.onChange(() => {
          if (quiet()) finish(true);
        });
        const cancel = services.schedule(timeoutMs, () => finish(false));
      });
    }
  };
}

const installedApps = new Map<string, WheelBridgeApp>();

function soleApp(): WheelBridgeApp {
  const ids = [...installedApps.keys()];
  if (ids.length === 1) return installedApps.get(ids[0])!;
  if (ids.length === 0) throw new Error('no wheel app bridge is installed');
  throw new Error(`multiple wheel apps mounted (${ids.join(', ')}) — use __wheel.app(id)`);
}

function makeGlobal(): WheelGlobal {
  const proxy = <K extends keyof WheelBridgeApp>(method: K): WheelBridgeApp[K] =>
    ((...args: unknown[]) =>
      (soleApp()[method] as (...a: unknown[]) => unknown)(...args)) as WheelBridgeApp[K];
  return {
    apps: () => [...installedApps.keys()],
    app: (appId) => {
      if (appId === undefined) return soleApp();
      const found = installedApps.get(appId);
      if (!found) {
        throw new Error(`no wheel app '${appId}' (mounted: ${[...installedApps.keys()].join(', ') || 'none'})`);
      }
      return found;
    },
    meta: proxy('meta'),
    state: proxy('state'),
    components: proxy('components'),
    component: proxy('component'),
    find: proxy('find'),
    act: proxy('act'),
    actService: proxy('actService'),
    actions: proxy('actions'),
    tables: proxy('tables'),
    writes: proxy('writes'),
    // Errors are WINDOW-scoped — readable with zero or many apps mounted (a
    // crashed app may have uninstalled itself; its errors must remain
    // readable). A sole app answers itself so its feed seam applies.
    errors: () => {
      if (installedApps.size === 1) return [...installedApps.values()][0]!.errors();
      return [...(activeErrorLog()?.entries() ?? [])];
    },
    highlight: proxy('highlight'),
    settle: proxy('settle')
  };
}

/**
 * Install this app's bridge on `window.__wheel`. Dev-mode only (pass
 * `force: true` to opt a production build in deliberately). Returns the
 * uninstaller; mounting surfaces (WheelApp, the debug panel) call this and
 * uninstall on cleanup. Installing twice for the same context is harmless —
 * the second install is a no-op returning a no-op.
 */
export function installWheelBridge(
  context: WheelContextValue,
  options?: { appId?: string; force?: boolean }
): () => void {
  if (!isWheelDevMode() && !options?.force) return () => {};
  if (typeof window === 'undefined') return () => {};
  for (const app of installedApps.values()) {
    if ((app as { __context?: WheelContextValue }).__context === context) return () => {};
  }
  let appId = options?.appId ?? context.services.scopeId;
  let slot = 2;
  while (installedApps.has(appId)) {
    appId = `${options?.appId ?? context.services.scopeId}#${slot}`;
    slot += 1;
  }
  const bridge = makeAppBridge(appId, context);
  Object.defineProperty(bridge, '__context', { value: context, enumerable: false });
  installedApps.set(appId, bridge);
  const w = window as Window & { __wheel?: WheelGlobal };
  w.__wheel ??= makeGlobal();
  return () => {
    installedApps.delete(appId);
  };
}
