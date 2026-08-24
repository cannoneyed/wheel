/**
 * Internal Solid contexts shared by connect() and the providers.
 * Not exported from the package — app code never touches these directly
 * (that's the point of the one-door rule).
 */
import { createContext } from 'solid-js';

import type { ContextClient, ServiceContext } from './services';

/**
 * Everything a connect declaration can reach: the sync client (null when the
 * app runs without sync) and the service container for this tree.
 *
 * Typed as the narrow `ContextClient` seam, NOT the full sync `SyncClient`:
 * `core` must not name the sync layer, and nothing here reads more than the
 * seam exposes (the field is pure passthrough into `ServiceContext`). The full
 * `SyncClient` an app passes to `WheelProvider` is assignable to it.
 */
export interface WheelContextValue {
  readonly client: ContextClient | null;
  readonly services: ServiceContext;
}

/**
 * The single Solid context the providers install and connect() reads — one
 * door into services, so components can't grow ad-hoc entries.
 */
export const WheelContext = createContext<WheelContextValue>();

/**
 * Stub map for sandboxes/tests: keys are connection functions (object
 * identity), values are the shapes to hand out instead of running the real
 * declaration. Checked before anything else — a fully stubbed component needs
 * no providers at all.
 */
export const StubContext = createContext<ReadonlyMap<object, unknown>>();
