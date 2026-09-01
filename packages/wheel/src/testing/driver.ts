/**
 * The wheel driver: typed, node-side access to a running app's
 * `window.__wheel` bridge from a playwright test (or any harness with a
 * `page.evaluate`).
 *
 *   const wheel = wheelDriver(page);
 *   await wheel.settle();                                  // wait for sync quiet
 *   const tree = await wheel.components();                 // the mounted component tree
 *   const row  = await wheel.component('card:42');         // one instance's live state
 *   const res  = await wheel.act('card:42', 'toggle');     // invoke a shape action
 *
 * THE RULE THAT MAKES THIS SAFE TO AUTOMATE: every write goes through an
 * action (`act` / `actService`) — the bridge has no direct state writes, so a
 * driven session can only do what the app's own UI could do.
 *
 * ERRORS ARE UNMISSABLE BY DESIGN: every driver call ends by reading the
 * app's captured-error buffer, and anything NEW since the last call throws a
 * `WheelAppError` (opt out per-driver with `ignoreAppErrors`, then read
 * `newErrors()` manually). The cursor starts at ZERO, so a fresh driver's
 * first call surfaces errors that predate it — attaching to an already
 * broken app is loud, not silent. When something looks wrong, `errors()` is
 * the first read.
 *
 * Structurally typed against `page.evaluate` — no playwright dependency in
 * wheel; any object with a compatible `evaluate` works.
 */
import type {
  BridgeActResult,
  BridgeComponentDetail,
  BridgeComponentSummary,
  BridgeErrorEntry,
  BridgeMeta,
  WheelGlobal
} from '../core/bridge-contract';
import type { InstanceTreeNode } from '../core/debug-registry';

/** The slice of playwright's Page the driver needs (structural — no dependency). */
export interface DriverPage {
  evaluate<R, Arg>(fn: (arg: Arg) => R | Promise<R>, arg: Arg): Promise<R>;
}

/** Thrown when a driven app captured new errors during a driver call. */
export class WheelAppError extends Error {
  constructor(readonly entries: readonly BridgeErrorEntry[]) {
    super(
      `wheel app captured ${entries.length} error(s):\n` +
        entries.map((entry) => `[${entry.id}] ${entry.message}\n  ${entry.stack.join('\n  ')}`).join('\n')
    );
    this.name = 'WheelAppError';
  }
}

/** Options for {@link wheelDriver}. */
export interface WheelDriverOptions {
  /** Target app id when several wheel apps share the page (`__wheel.apps()`). */
  readonly app?: string;
  /** Suppress throw-on-new-errors; read `newErrors()` yourself instead. */
  readonly ignoreAppErrors?: boolean;
}

type BridgeMethod =
  | 'meta'
  | 'state'
  | 'components'
  | 'component'
  | 'find'
  | 'act'
  | 'actService'
  | 'actions'
  | 'collections'
  | 'subscriptions'
  | 'writes'
  | 'errors'
  | 'highlight'
  | 'settle';

/** The driver surface: the bridge's methods, awaited, plus error accounting. */
export interface WheelDriver {
  meta(): Promise<BridgeMeta>;
  state(): Promise<ReturnType<WheelGlobal['state']>>;
  components(): Promise<InstanceTreeNode[]>;
  component(instanceId: string): Promise<BridgeComponentDetail | null>;
  find(query: string): Promise<BridgeComponentSummary[]>;
  act(instanceId: string, action: string, ...args: unknown[]): Promise<BridgeActResult>;
  actService(serviceName: string, actionName: string, ...args: unknown[]): Promise<BridgeActResult>;
  actions(): Promise<ReturnType<WheelGlobal['actions']>>;
  collections(): Promise<ReturnType<WheelGlobal['collections']>>;
  subscriptions(): Promise<ReturnType<WheelGlobal['subscriptions']>>;
  writes(limit?: number): Promise<Array<Record<string, unknown>>>;
  /** The app's full captured-error buffer. */
  errors(): Promise<BridgeErrorEntry[]>;
  /** Errors captured since the last driver call (drains the driver's cursor). */
  newErrors(): Promise<BridgeErrorEntry[]>;
  highlight(instanceId: string | null): Promise<void>;
  settle(timeoutMs?: number): Promise<{ settled: boolean } & BridgeMeta>;
}

/** Build a driver over a page whose app installed the `window.__wheel` bridge. */
export function wheelDriver(page: DriverPage, options: WheelDriverOptions = {}): WheelDriver {
  let seenErrors = 0;

  const evaluate = <R>(method: BridgeMethod, args: readonly unknown[]): Promise<R> =>
    page.evaluate(
      async (payload: { app?: string; method: string; args: readonly unknown[] }) => {
        const w = window as Window & { __wheel?: WheelGlobal };
        if (!w.__wheel) {
          throw new Error(
            'window.__wheel is not installed — is the app running in dev mode with a debug surface (WheelApp / WheelDebugPanel) mounted?'
          );
        }
        const app = payload.app === undefined ? w.__wheel : w.__wheel.app(payload.app);
        const fn = (app as unknown as Record<string, (...a: unknown[]) => unknown>)[payload.method];
        return (await fn.call(app, ...payload.args)) as never;
      },
      { app: options.app, method, args }
    ) as Promise<R>;

  const drainNewErrors = async (): Promise<BridgeErrorEntry[]> => {
    const all = await evaluate<BridgeErrorEntry[]>('errors', []);
    const fresh = all.slice(seenErrors);
    seenErrors = all.length;
    return fresh;
  };

  /** Every call funnels through here: run the method, then surface new app errors. */
  const call = async <R>(method: BridgeMethod, args: readonly unknown[]): Promise<R> => {
    const result = await evaluate<R>(method, args);
    if (method !== 'errors') {
      const fresh = await drainNewErrors();
      if (fresh.length > 0 && !options.ignoreAppErrors) {
        throw new WheelAppError(fresh);
      }
    }
    return result;
  };

  return {
    meta: () => call('meta', []),
    state: () => call('state', []),
    components: () => call('components', []),
    component: (instanceId) => call('component', [instanceId]),
    find: (query) => call('find', [query]),
    act: (instanceId, action, ...args) => call('act', [instanceId, action, args]),
    actService: (serviceName, actionName, ...args) => call('actService', [serviceName, actionName, args]),
    actions: () => call('actions', []),
    collections: () => call('collections', []),
    subscriptions: () => call('subscriptions', []),
    writes: (limit) => call('writes', limit === undefined ? [] : [limit]),
    errors: () => evaluate('errors', []),
    newErrors: drainNewErrors,
    highlight: (instanceId) => call('highlight', [instanceId]),
    settle: (timeoutMs) => call('settle', timeoutMs === undefined ? [] : [timeoutMs])
  };
}
