/**
 * connect() — the one sanctioned door between components and state.
 *
 * There is exactly ONE connection function per component, called once at the
 * top of the component. Its declaration is the component's complete data
 * manifest: every value read and every action available, named in one place,
 * statically analyzable, and recorded in the registry at runtime.
 *
 * Conventions (lint-enforced by `single-connect` and friends):
 * - The result of connect() is named `connect<ComponentName>` — never a
 *   `use`-prefixed hook. One call per component, first statement.
 * - Queries are NOT declared here. All server data flows through a service
 *   (`SyncService.liveQuery`); the connection reads service values.
 * - Shapes carry data as values (reactive getters) and actions as bound
 *   functions — never whole service instances.
 */

import { getOwner, onCleanup, useContext, type JSX } from 'solid-js';

import {
  ServiceContext,
  type ContextClient,
  type Service,
  type ServiceClass,
  type ServiceOverrideOptions
} from './services';
import { WheelContext, StubContext } from './context';
import { setActiveRegistry, type DebugSnapshot, type InstanceRecord } from './debug-registry';
import { isWheelDevMode } from './dev-mode';
import { assertSingleSolidRuntime } from './solid-runtime';

/**
 * connect() stamps each mounted instance's registry record on the Solid
 * owner under this key; `use:componentRoot` walks the owner chain up to
 * find it. Plain userland Solid (an expando on getOwner()) — no internals,
 * works identically in production builds.
 */
const INSTANCE_KEY = Symbol('wheel.instance');

type OwnerWithInstance = { [INSTANCE_KEY]?: InstanceRecord; owner: OwnerWithInstance | null };

/**
 * The mounted instance whose component body is running right now, or
 * undefined outside one. The visibility wrappers (`visibility.tsx`) use
 * this to report a falsy condition against the right component.
 */
export function currentInstance(): InstanceRecord | undefined {
  return nearestInstance(getOwner() as OwnerWithInstance | null);
}

/**
 * The nearest enclosing mounted instance on the owner chain — the parent
 * edge of the component tree. Every Solid component body runs under its own
 * owner (verified against nested, sibling, <Show>/<For>-deferred, and
 * portaled children), so walking up from the current owner finds exactly the
 * logical parent, portals included.
 */
function nearestInstance(owner: OwnerWithInstance | null): InstanceRecord | undefined {
  while (owner) {
    if (owner[INSTANCE_KEY]) return owner[INSTANCE_KEY];
    owner = owner.owner;
  }
  return undefined;
}

/** Client-backed root provider. Mount once at the app root. */
export function WheelProvider(props: {
  client: ContextClient;
  children: JSX.Element;
}): JSX.Element {
  assertSingleSolidRuntime();
  const services = new ServiceContext({ client: props.client, scopeId: 'root' });
  onCleanup(() => services.dispose());
  return (
    <WheelContext.Provider value={{ client: props.client, services }}>
      {props.children}
    </WheelContext.Provider>
  );
}

/**
 * Child scope (or clientless root, for pure-local sandboxes). Overrides inject
 * service fakes for the subtree — the substitution seam for tests/sandboxes.
 */
export function ServiceProvider(props: {
  scopeId?: string;
  inheritServices?: boolean | 'live';
  overrides?: Array<{
    original: ServiceClass;
    replacement: Service;
    ownership: ServiceOverrideOptions['ownership'];
  }>;
  children: JSX.Element;
}): JSX.Element {
  assertSingleSolidRuntime();
  const parent = useContext(WheelContext);
  const services = parent
    ? parent.services.child({ scopeId: props.scopeId, inheritServices: props.inheritServices })
    : new ServiceContext({ scopeId: props.scopeId ?? 'sandbox' });
  for (const { original, replacement, ownership } of props.overrides ?? []) {
    services.override(original, replacement, { ownership });
  }
  onCleanup(() => services.dispose());
  return (
    <WheelContext.Provider value={{ client: parent?.client ?? null, services }}>
      {props.children}
    </WheelContext.Provider>
  );
}

/**
 * A reactive, READ-ONLY window onto the debug registry of the nearest
 * provider's tree: returns an accessor that yields the plain-data
 * `DebugSnapshot` and re-fires (inside a computation) whenever the registry
 * changes — mounts, unmounts, field writes.
 *
 * This is the sanctioned TOOLING door — debug surfaces, stub-inventory
 * pages, test probes. It deliberately exposes no services and no mutable
 * context state, so the one-door rule for application data (connect()) is
 * untouched; `connect-only` still forbids the service-container escapes by
 * name. Independent of dev mode, the bridge, window globals, and storage —
 * it works wherever a provider does, including sandboxed opaque-origin
 * iframes.
 *
 * Throws outside a provider, matching connect().
 */
export function useDebugSnapshot(): () => DebugSnapshot {
  const context = useContext(WheelContext);
  if (!context) {
    throw new Error('useDebugSnapshot() used outside a WheelProvider/ServiceProvider');
  }
  const services = context.services;
  return () => services.debugSnapshot();
}

/** The declaration surface available inside connect() callbacks. */
export interface Connector {
  /**
   * Resolve a service to pull specific values and actions from. Bind the
   * result to a named variable (`const todoService = c.service(TodoService)`).
   *
   * This is the ONLY connector member: all state — reads and mutations alike —
   * flows through a service, per doctrine. (A `c.mutate(...)` shortcut once
   * lived here; it had zero call sites and coupled core to the sync client, so
   * it was removed.)
   */
  service<S extends Service>(ServiceType: ServiceClass<S>): S;
}

/**
 * Build the connector surface for a component's connect declaration.
 * @internal — kernel use only.
 */
export function makeConnector(services: ServiceContext): Connector {
  const registry = services.registry;
  return {
    service(ServiceType) {
      const instance = services.get(ServiceType);
      const identity = (
        instance as Service & { __debugIdentity?: () => string }
      ).__debugIdentity?.() ?? '';
      registry.noteService(identity, ServiceType.name);
      return instance;
    }
  };
}

/**
 * Declare a component's complete state manifest. Returns the component's ONE
 * connection function, called once at the top of the component:
 *
 *   const connectTodoList = connect('TodoList', (c, props: { listId: string }) => {
 *     const todoService = c.service(TodoService);
 *     return {
 *       get rows() { return todoService.rows(); },
 *       get status() { return todoService.status(); },
 *       add: todoService.add
 *     };
 *   });
 *
 *   export function TodoList(props: { listId: string }) {
 *     const state = connectTodoList(props);
 *     ...
 *   }
 */
export function connect<Props, Shape>(
  componentName: string | ((props: Props) => string),
  declare: (c: Connector, props: Props) => Shape,
  options?: {
    /**
     * The component tree GROUP: `'app'` (default — your components, the open
     * bucket) or `'framework'` (wheel's own kit/router/debug components,
     * collapsed). Any string makes a custom bucket.
     */
    readonly group?: string;
  }
): (props: Props) => Shape {
  const connection = function connection(props: Props): Shape {
    // Stubs win over everything: a stubbed component renders with no
    // providers at all — that's the Tier 1 sandbox story.
    const stubs = useContext(StubContext);
    const stub = stubs?.get(connection);
    if (stub !== undefined) return stub as Shape;

    // Per-INSTANCE names (`connect((props) => \`menu:item:${props.id}\`, …)`)
    // give each mounted instance its own registry manifest; the instance
    // unregisters through Solid's lifecycle, so `<For>` lists can't grow the
    // registry without bound.
    const name = typeof componentName === 'function' ? componentName(props) : componentName;

    const context = useContext(WheelContext);
    if (!context) {
      throw new Error(`connect('${name}') used outside a WheelProvider/ServiceProvider`);
    }
    const { services } = context;
    const registry = services.registry;
    const connector = makeConnector(services);

    if (typeof componentName === 'function') {
      onCleanup(() => registry.removeComponent(name));
    }

    // Bracket the declaration so view() can record which primitives this
    // component reads: currentComponent names the edge's owner, activeRegistry
    // gives view() (a plain function with no context handle) the registry to
    // record into. Both reset in the finally so a throw can't leak the state.
    registry.currentComponent = name;
    setActiveRegistry(registry);
    let shape: Shape;
    try {
      shape = declare(connector, props);
    } finally {
      registry.currentComponent = null;
      setActiveRegistry(null);
    }

    // Instance registration: one record per MOUNT, removed on
    // cleanup, stamped on the owner so `use:componentRoot` can attach the
    // component's DOM. Cost per mount: one Map entry + one symbol expando.
    // The parent edge is resolved BEFORE stamping — the walk starts at this
    // component's own (unstamped) owner and finds the nearest enclosing
    // mounted instance.
    if (shape !== null && typeof shape === 'object') {
      const owner = getOwner() as OwnerWithInstance | null;
      const parent = nearestInstance(owner);
      const { record, unregister } = registry.registerInstance(name, shape, {
        kind: 'connected',
        group: options?.group,
        // The stable key, never the display id — a renumber must not
        // strand a child's parent edge.
        parentId: parent?.key ?? null,
        // Props come free here: connect() is called WITH them. Passing the
        // object (not a copy) keeps the tree's view live.
        props: () => props as object
      });
      if (owner) {
        owner[INSTANCE_KEY] = record;
      }
      onCleanup(unregister);
    }
    return shape;
  };
  return connection;
}

/**
 * The `use:componentRoot` directive — mark a connected component's
 * root element(s) so rectangle selection and the inspector can find it:
 *
 *   <li use:componentRoot class={styles.row}>
 *
 * No arguments: the directive walks the owner chain to the nearest
 * connect() instance and attaches this element to it. Multi-root components
 * mark each root sibling (bounds = union). Detachment is automatic on
 * cleanup, so roots inside <Show> re-register correctly and unmounted
 * instances can't leak elements.
 */
export function componentRoot(el: HTMLElement, _value: () => true): void {
  const record = nearestInstance(getOwner() as OwnerWithInstance | null);
  if (!record) {
    return; // stubbed component or non-wheel subtree: silently inert
  }
  record.elements.add(el);
  if (isWheelDevMode()) {
    // Dev selector stamp: plain `[data-wheel-id="TodoRow"]` CSS works in
    // playwright with no bridge call. Dev-only — prod DOM stays unmarked.
    el.setAttribute('data-wheel-id', record.instanceId);
  }
  onCleanup(() => record.elements.delete(el));
}

/**
 * The `use:viewRoot` directive — how a DUMB (non-connected) component
 * registers in the component tree:
 *
 *   export function Avatar(props: { url: string }) {
 *     return <img use:viewRoot={'Avatar'} src={props.url} />;
 *   }
 *
 * The string names the component (lint checks it matches the enclosing
 * function); the object form additionally carries `group` and the
 * component's `props`, so the tree can show them. Dev mode only — in production builds this is a flag check and
 * nothing else, so marking every dumb component costs nothing. In dev each
 * marked mount gets a live-slot instance id (`Avatar`, `Avatar#2`), a
 * `data-wheel-id` DOM stamp, and a parent edge to the nearest enclosing
 * instance — which is what makes the debug panel's component tree and the
 * agent bridge see the WHOLE component tree, not just the connected layer.
 *
 * Mark ONE root element per view component. Components that render no DOM
 * of their own carry the `// wheel-view-root: <reason>` pragma instead.
 * Lint-enforced by `require-view-root`.
 */
export function viewRoot(
  el: HTMLElement,
  value: () => string | { name: string; group?: string; props?: object }
): void {
  if (!isWheelDevMode()) {
    return; // production: registration and DOM stamps are dev-only surfaces
  }
  const context = useContext(WheelContext);
  if (!context) {
    return; // outside any provider (docs snippets, stub sandboxes): silently inert
  }
  const raw = value();
  const named = typeof raw === 'string' ? { name: raw, group: undefined, props: undefined } : raw;
  const owner = getOwner() as OwnerWithInstance | null;
  const parent = nearestInstance(owner);
  const { record, unregister } = context.services.registry.registerInstance(named.name, {}, {
    kind: 'view',
    group: named.group,
    // Stable key, not the display id (see connect()).
    parentId: parent?.key ?? null,
    // A dumb component's props are only visible if the directive passes
    // them — `require-view-props` makes that non-optional when the
    // component takes props at all.
    props: named.props ? () => named.props : undefined
  });
  record.elements.add(el);
  el.setAttribute('data-wheel-id', record.instanceId);
  // Stamp the owner so components nested INSIDE this view chain their parent
  // edge through it — the tree stays complete across dumb layers.
  if (owner) {
    owner[INSTANCE_KEY] = record;
  }
  onCleanup(unregister);
}

declare module 'solid-js' {
  namespace JSX {
    interface Directives {
      componentRoot: true;
      viewRoot: string | { name: string; group?: string; props?: object };
    }
  }
}
