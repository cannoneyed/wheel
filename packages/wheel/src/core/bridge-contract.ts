/**
 * The `window.__wheel` bridge CONTRACT — types only, no implementation.
 *
 * Lives in core so both sides of the bridge can name it without bending the
 * layer DAG: `debug` implements it (browser side), `testing` drives it
 * (node side, through playwright's `page.evaluate`). See `debug/bridge.ts`
 * for the full doctrine writeup; the short version:
 *
 * - reads return plain JSON (bounded serialization),
 * - actions are the ONLY writes (`act`/`actService` — no direct atom door),
 * - `errors()` is the first read when anything looks wrong,
 * - installation is dev-gated; production bundles grow no global.
 */
import type { InstanceTreeNode } from './debug-registry';

/** A DOM rectangle in viewport CSS pixels (JSON-safe). */
export interface BridgeRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** One mounted instance, summarized for lists and find() results. */
export interface BridgeComponentSummary {
  readonly instanceId: string;
  readonly name: string;
  readonly kind: 'connected' | 'view';
  readonly parentId: string | null;
  /** Union bounds of the instance's registered root elements, or null when none are connected. */
  readonly rect: BridgeRect | null;
}

/** Full detail for one mounted instance: live props/state, actions, per-element rects. */
export interface BridgeComponentDetail extends BridgeComponentSummary {
  /** What the parent passed. Callbacks and DOM nodes are named, not expanded. */
  readonly props: Record<string, unknown>;
  /** Component-local `useSignal` state, by name. */
  readonly locals: Record<string, unknown>;
  readonly state: Record<string, unknown>;
  readonly actions: readonly string[];
  readonly rects: readonly BridgeRect[];
}

/** The result of an action invocation through the bridge. */
export type BridgeActResult =
  | { readonly ok: true; readonly result: unknown }
  | { readonly ok: false; readonly error: string };

/** Header stats: sync position, pending writes, connection, mounted count. */
export interface BridgeMeta {
  readonly appId: string;
  readonly scopeId: string;
  readonly seq: number;
  readonly pending: number;
  readonly status: string;
  readonly instances: number;
}

/** One captured error (see error-capture); the buffer is empty until an ErrorService mounts. */
export interface BridgeErrorEntry {
  readonly id: string;
  readonly message: string;
  readonly stack: readonly string[];
  readonly at: number;
}

/** One row of the state tree: a service and its primitives' current values. */
export interface BridgeServiceState {
  readonly service: string;
  readonly scopeId: string;
  /** The class's `static group` ('app' | 'framework' | 'debug' | custom). */
  readonly group: string;
  readonly primitives: Array<{ id: string; name: string; kind: string; value: unknown }>;
}

/** The per-app bridge surface — every method returns plain JSON. */
export interface WheelBridgeApp {
  meta(): BridgeMeta;
  /** The registry state tree: every service and its primitives' current values. */
  state(): BridgeServiceState[];
  /** The mounted component tree (owner-chain parent edges, mount order). */
  components(): InstanceTreeNode[];
  /** One instance's live detail, or null if the id isn't mounted. */
  component(instanceId: string): BridgeComponentDetail | null;
  /** Instances whose id or name contains `query` (case-insensitive). */
  find(query: string): BridgeComponentSummary[];
  /** Invoke a mounted instance's shape action. Async actions are awaited. */
  act(instanceId: string, action: string, args?: readonly unknown[]): Promise<BridgeActResult>;
  /** Invoke a service action by `ServiceName`, `actionName`. Async actions are awaited. */
  actService(
    serviceName: string,
    actionName: string,
    args?: readonly unknown[]
  ): Promise<BridgeActResult>;
  /** Every invocable service action: the catalog behind actService. */
  actions(): Array<{ service: string; action: string; id: string; serviceId: string }>;
  /** The client's collection cache (empty for clientless apps). */
  collections(): Array<{ collection: string; rows: readonly Record<string, unknown>[] }>;
  /** Active client subscriptions and their local reference and row counts. */
  subscriptions(): Array<{ key: string; subscriptionId: string; refs: number; rows: number }>;
  /** The provenance change stream, newest last (empty for clientless apps). */
  writes(limit?: number): Array<Record<string, unknown>>;
  /** Captured errors, oldest first. Check this FIRST when the app misbehaves. */
  errors(): BridgeErrorEntry[];
  /** Outline an instance on the page (null clears). For showing a human what you mean. */
  highlight(instanceId: string | null): void;
  /**
   * Resolves when the sync client is quiet (0 pending, connected) or after
   * `timeoutMs` (default 5000). `settled: false` means the timeout hit first.
   */
  settle(timeoutMs?: number): Promise<{ settled: boolean } & BridgeMeta>;
}

/** The `window.__wheel` global: per-app bridges plus sole-app conveniences. */
export interface WheelGlobal extends WheelBridgeApp {
  /** Ids of every mounted app bridge. */
  apps(): string[];
  /** A specific app's bridge — required when more than one app is mounted. */
  app(appId?: string): WheelBridgeApp;
}
