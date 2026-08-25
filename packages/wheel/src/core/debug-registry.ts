/**
 * Per-context debug registry: the primitive → service → component dependency
 * graph behind wheel's auditability story.
 *
 * Two deliberate design constraints:
 * - Scoped per ServiceContext instead of a module-global singleton (no
 *   cross-app bleed, no SSR hazards, disposable with the context).
 * - Component dependency edges are deduped by primitive id (an undeduped
 *   array grows without bound across re-renders).
 */
import { untrack } from 'solid-js';

/** Identity + provenance stamp carried by every kernel primitive. */
export interface DebugMeta {
  readonly id: string;
  readonly name: string;
  readonly kind: 'atom' | 'computed' | 'action' | 'field' | 'machine' | 'liveQuery';
  /** Stamped when the owning service registers its fields. */
  serviceName?: string;
  /** Constructor-and-scope identity of the owning service. */
  serviceId?: string;
  /** Source location captured at declaration time, when available. */
  readonly declaredAt?: string;
}

/** One service singleton in one concrete scope. */
export interface DebugServiceRecord {
  readonly id: string;
  readonly name: string;
  readonly scopeId: string;
  /**
   * The state-tree group this service renders under (`static group` on the
   * class): `'app'` (default, open), `'framework'` (kit/router internals,
   * closed), `'debug'` (wheel's own debug services — hidden from the panel,
   * visible to the bridge), or any custom string.
   */
  readonly group: string;
  readonly primitiveIds: string[];
}

/** A component's declared dependency edge, recorded at connect() time. */
export interface ComponentRecord {
  readonly name: string;
  /** Primitive ids this component's connect declaration pulled in. */
  readonly dependencies: Set<string>;
  /** Query subscription keys this component declared. */
  readonly queryKeys: Set<string>;
}

/**
 * One MOUNTED component: its identity, its DOM (attached by
 * `use:componentRoot` / `use:viewRoot`), and a live window into its connect
 * shape. The manifest above answers "what does TodoRow depend on"; this
 * answers "which TodoRow is at (312, 480) and what is ITS state right now."
 *
 * Production cost, deliberately tiny: one record per mounted instance in a
 * Map, one Set of element refs. Nothing measures rects or reads state until
 * an inspector actually asks. (`view`-kind records exist in dev mode only.)
 */
export interface InstanceRecord {
  /**
   * Internal, never-changing handle: `<name>#<slot>`. The registry keys on
   * this so a record can be found even while its DISPLAY id changes.
   * @internal — use `instanceId` for anything user- or agent-facing.
   */
  readonly key: string;
  /**
   * The id everything else uses — a selector, a `data-wheel-id`, a bridge
   * argument. DERIVED, not fixed at mount:
   *
   * - a name with exactly ONE live instance shows bare: `TodoList`;
   * - a name with several shows its slot: `TodoRow#1`, `TodoRow#2`.
   *
   * Numbering only where something actually repeats is the whole point:
   * suffixing a singleton `TodoList#1` is noise. The consequence is that
   * ids are stable per SITUATION, not forever — mounting a second `TodoRow`
   * renames the first from `TodoRow` to `TodoRow#1`, and the registry
   * re-stamps the DOM so `data-wheel-id` never drifts from the tree.
   *
   * Slots are reused lowest-first, so the same mount order reproduces the
   * same ids after a reload.
   */
  readonly instanceId: string;
  /** The manifest name this instance connects under. */
  readonly name: string;
  /** `connected` = registered by connect(); `view` = a dumb component's use:viewRoot (dev only). */
  readonly kind: 'connected' | 'view';
  /** Component tree bucket: `'app'` (default) or `'framework'` (wheel's own components); custom strings allowed. */
  readonly group: string;
  /**
   * The owner-chain HINT recorded at mount — reliable only in dev builds
   * (production siblings share owners). Display surfaces use
   * `DebugRegistry.displayParentId` (DOM containment) instead; this remains
   * as the headless-instance fallback.
   */
  readonly parentId: string | null;
  /**
   * Why this component renders nothing, when something knows: `'show'`
   * means a wheel `<Show>` at its root evaluated falsy. `null` means
   * "nothing is suppressing it" — so no DOM then means headless, or a
   * missing `use:componentRoot`. Written by the tracking wrappers in
   * `visibility.tsx`; plain Solid control flow leaves it null.
   */
  hiddenBy: 'show' | null;
  /** Root elements attached by `use:componentRoot` (multi-root = several). */
  readonly elements: Set<Element>;
  /** LIVE state: re-reads the connect shape's getters on every call. */
  state(): Record<string, unknown>;
  /**
   * LIVE props: the object the component was called with, read fresh on
   * every call. Empty for components wheel never saw props for (a view
   * component whose `use:viewRoot` didn't pass them).
   *
   * Values are projected for DISPLAY, not cloned: data comes through as
   * data, and anything that isn't (a callback, a DOM node) is NAMED rather
   * than expanded. Props are meant to be identity and variation — plain,
   * serializable data — so anything that shows up as `<fn …>` here is worth
   * a second look.
   */
  props(): Record<string, unknown>;
  /**
   * Component-local signals declared with `useSignal(initial, 'name')`, in
   * declaration order. Each read is live. Plain `createSignal` is invisible
   * here, which is what `require-use-signal` exists to prevent.
   */
  readonly locals: Array<{ readonly name: string; readonly read: () => unknown }>;
  /** The shape's action names (functions are listed, never invoked). */
  readonly actions: readonly string[];
  /** Invoke one of the shape's actions by name — the bridge's per-instance write door. */
  invoke(action: string, args: readonly unknown[]): unknown;
}

/** One node of the mounted-component tree (parents from DOM containment). */
export interface InstanceTreeNode {
  readonly instanceId: string;
  readonly name: string;
  readonly kind: InstanceRecord['kind'];
  readonly group: string;
  readonly children: InstanceTreeNode[];
}

/** An instance's first inserted element, or null when it renders no DOM. */
function positionedElement(record: InstanceRecord): Element | null {
  for (const element of record.elements) {
    if (element.isConnected) return element;
  }
  return null;
}

/** Document-order comparator; DOM-less records sort last, order preserved. */
function compareDocumentOrder(a: InstanceRecord, b: InstanceRecord): number {
  const elementA = positionedElement(a);
  const elementB = positionedElement(b);
  if (!elementA && !elementB) return 0;
  if (!elementA) return 1;
  if (!elementB) return -1;
  const relation = elementA.compareDocumentPosition(elementB);
  if (relation & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
  if (relation & Node.DOCUMENT_POSITION_PRECEDING) return 1;
  return 0;
}

function domDepth(element: Element): number {
  let depth = 0;
  let current: Element | null = element;
  while (current) {
    depth += 1;
    current = current.parentElement;
  }
  return depth;
}

/**
 * A service class's display identity: its declared `static serviceName`, or
 * its class name when it has not declared one.
 *
 * The declaration exists because a minifier renames the class, and the class
 * name is what the state tree, `actService` lookups and annotation timelines
 * print. `BoardService.toggleCell` has to survive a production build; `iu.rT`
 * helps nobody. `require-service-name` makes the declaration mandatory.
 *
 * Only an OWN property counts. Statics inherit, so reading the inherited one
 * would make `class Child extends Parent {}` report itself as `Parent`.
 */
export function serviceDisplayName(ServiceType: Function): string {
  const declared = Object.hasOwn(ServiceType, 'serviceName')
    ? (ServiceType as { serviceName?: unknown }).serviceName
    : undefined;
  return typeof declared === 'string' && declared.length > 0 ? declared : ServiceType.name;
}

/** Live registry for one ServiceContext tree. */
export class DebugRegistry {
  private readonly primitives = new Map<
    string,
    { meta: DebugMeta; read: () => unknown; invoke?: (...args: unknown[]) => unknown }
  >();
  private readonly services = new Map<string, DebugServiceRecord>();
  private readonly serviceTypeIds = new WeakMap<Function, number>();
  private readonly scopeIds = new WeakMap<object, number>();
  private readonly components = new Map<string, ComponentRecord>();
  private readonly instanceRecords = new Map<string, InstanceRecord>();
  private counter = 0;
  private serviceTypeCounter = 0;
  private scopeCounter = 0;

  /** Wired to the owning context's revision bump so debug surfaces re-render when registry state changes. */
  onChange: (() => void) | null = null;

  /** Component currently running its connect declaration, if any. */
  currentComponent: string | null = null;

  /** Mints a stable, human-scannable id (`atom_3`, `computed_7`) per primitive kind. */
  nextId(kind: DebugMeta['kind']): string {
    this.counter += 1;
    return `${kind}_${this.counter}`;
  }

  /**
   * Adds a reactive primitive (and a way to read its current value) to the
   * graph. Actions also pass their callable — the bridge's `actService` door;
   * reads never invoke it.
   */
  registerPrimitive(meta: DebugMeta, read: () => unknown, invoke?: (...args: unknown[]) => unknown): void {
    this.primitives.set(meta.id, { meta, read, invoke });
  }

  /**
   * Service-level action lookup for the bridge: every registered action
   * matching `serviceName.actionName`, with its scope identity so callers can
   * disambiguate a service mounted in several scopes.
   */
  findActions(
    serviceName: string,
    actionName: string
  ): Array<{ id: string; serviceId: string; invoke: (...args: unknown[]) => unknown }> {
    const matches: Array<{ id: string; serviceId: string; invoke: (...args: unknown[]) => unknown }> = [];
    for (const { meta, invoke } of this.primitives.values()) {
      if (meta.kind === 'action' && meta.serviceName === serviceName && meta.name === actionName && invoke) {
        matches.push({ id: meta.id, serviceId: meta.serviceId ?? '', invoke });
      }
    }
    return matches;
  }

  /** Remove a dynamically-created primitive when its explicit lifetime ends. */
  removePrimitive(id: string): void {
    this.primitives.delete(id);
  }

  /**
   * Adds one constructor in one scope. Class names are display labels only:
   * constructor and scope object identity prevent same-name and nested-scope
   * services from overwriting each other.
   */
  registerService(
    ServiceType: Function,
    scope: object,
    scopeId: string,
    primitiveIds: string[]
  ): string {
    let typeId = this.serviceTypeIds.get(ServiceType);
    if (typeId === undefined) {
      typeId = ++this.serviceTypeCounter;
      this.serviceTypeIds.set(ServiceType, typeId);
    }
    let concreteScopeId = this.scopeIds.get(scope);
    if (concreteScopeId === undefined) {
      concreteScopeId = ++this.scopeCounter;
      this.scopeIds.set(scope, concreteScopeId);
    }
    const id = `service_${typeId}@scope_${concreteScopeId}`;
    this.services.set(id, {
      id,
      name: serviceDisplayName(ServiceType),
      scopeId,
      // Static inheritance makes subclasses carry their base's group unless
      // they override it; absent entirely → 'app'.
      group: (ServiceType as { group?: string }).group ?? 'app',
      primitiveIds
    });
    return id;
  }

  /**
   * A registered service's state-tree group (`app`, `framework`, `debug`, or a
   * custom string), by the id stamped on its primitives' `DebugMeta`.
   *
   * A cheap Map read on purpose: the annotation recorder calls it on every
   * tapped write to drop wheel's OWN debug services from the timeline — a
   * recorder that records itself is noise, not evidence.
   */
  serviceGroup(serviceId: string): string | undefined {
    return this.services.get(serviceId)?.group;
  }

  /** Removes one disposed service from the shared context-tree graph. */
  removeService(id: string): void {
    this.services.delete(id);
  }

  /** Records "the component being connected depends on this primitive". */
  noteDependency(meta: DebugMeta): void {
    if (!this.currentComponent) return;
    this.component(this.currentComponent).dependencies.add(meta.id);
  }

  /** Records "the component being connected subscribed to this query key". */
  noteQuery(key: string): void {
    if (!this.currentComponent) return;
    this.component(this.currentComponent).queryKeys.add(key);
  }

  /** Records "the component being connected resolved this service". */
  noteService(serviceId: string, serviceName: string): void {
    if (!this.currentComponent) return;
    const identity = serviceId ? ` [${serviceId}]` : '';
    this.component(this.currentComponent).dependencies.add(`service:${serviceName}${identity}`);
  }

  /**
   * Removes a component's manifest — the disposal half of per-INSTANCE
   * connect names (`connect((props) => name, ...)`): instances register on
   * mount and MUST remove themselves on cleanup, or `<For>` lists would grow
   * the registry without bound.
   */
  removeComponent(name: string): void {
    this.components.delete(name);
  }

  /**
   * Registers one MOUNTED instance (every connect call, and — in dev mode —
   * every `use:viewRoot`). Returns the record (connect stamps it on the Solid
   * owner for `use:componentRoot`) and the unregister function (connect runs
   * it on cleanup — same rule as manifests: unmount MUST unregister).
   *
   * Ids are LIVE-SLOT and DERIVED (see `InstanceRecord.instanceId`): a lone
   * instance shows its bare name, siblings show `#1`/`#2`. Mount and unmount
   * therefore renumber a name's group, and this method re-stamps the
   * affected DOM so `data-wheel-id` always matches what the tree shows.
   */
  registerInstance(
    name: string,
    shape: object,
    options?: {
      kind?: InstanceRecord['kind'];
      group?: string;
      /** The PARENT'S STABLE KEY (never its display id — that can renumber). */
      parentId?: string | null;
      /** Live accessor for the component's props object (connect passes this automatically). */
      props?: () => object | undefined;
    }
  ): { record: InstanceRecord; unregister: () => void } {
    const slot = this.allocateSlot(name);
    const key = `${name}#${slot}`;
    const registry = this;
    const record: InstanceRecord = {
      key,
      get instanceId(): string {
        return registry.countNamed(name) > 1 ? key : name;
      },
      name,
      kind: options?.kind ?? 'connected',
      group: options?.group ?? 'app',
      hiddenBy: null,
      locals: [],
      parentId: options?.parentId ?? null,
      elements: new Set<Element>(),
      state: () => shapeState(shape),
      props: () => {
        const value = options?.props?.();
        return value ? readProps(value) : {};
      },
      actions: shapeActions(shape),
      invoke: (action, args) => {
        const value = (shape as Record<string, unknown>)[action];
        if (typeof value !== 'function') {
          throw new Error(
            `'${record.instanceId}' has no action '${action}' (actions: ${shapeActions(shape).join(', ') || 'none'})`
          );
        }
        return (value as (...a: readonly unknown[]) => unknown)(...args);
      }
    };
    this.instanceRecords.set(key, record);
    // Crossing 1 → 2 renames the incumbent (`TodoRow` becomes `TodoRow#1`).
    this.restampNamed(name);
    this.notifyDebug();
    return {
      record,
      unregister: () => {
        this.instanceRecords.delete(key);
        // Dropping back to 1 gives the survivor its bare name again.
        this.restampNamed(name);
        this.notifyDebug();
      }
    };
  }

  /** Smallest free slot for a name, so unmount/remount reproduces ids. */
  private allocateSlot(name: string): number {
    let slot = 1;
    while (this.instanceRecords.has(`${name}#${slot}`)) slot += 1;
    return slot;
  }

  /** How many live instances share a name — the input to bare-vs-numbered. */
  private countNamed(name: string): number {
    let count = 0;
    for (const record of this.instanceRecords.values()) {
      if (record.name === name) count += 1;
    }
    return count;
  }

  /**
   * Re-stamp `data-wheel-id` for every live instance of a name. Ids are
   * derived from how many share the name, so a mount or unmount can rename
   * the OTHERS — without this, the DOM would still advertise the old id and
   * a selector copied from the tree would miss.
   */
  private restampNamed(name: string): void {
    for (const record of this.instanceRecords.values()) {
      if (record.name !== name) continue;
      for (const element of record.elements) {
        // NOT gated on isConnected: a <For> builds every row's element
        // before inserting any of them, so the incumbent row is still
        // detached when the second row registers and triggers the rename.
        // Skipping it there left the DOM advertising the pre-rename id
        // (`TodoRow` while the tree said `TodoRow#1`).
        if (element.hasAttribute('data-wheel-id')) {
          element.setAttribute('data-wheel-id', record.instanceId);
        }
      }
    }
  }

  /** Notify debug surfaces after registry state changes without touching application data channels. */
  notifyDebug(): void {
    this.onChange?.();
  }

  /** Every currently mounted instance (insertion order = mount order). */
  instances(): readonly InstanceRecord[] {
    return [...this.instanceRecords.values()];
  }

  /**
   * The mounted instance by its DISPLAY id (`TodoList`, `TodoRow#2`) or its
   * stable key. Both resolve, so an id captured a moment before a renumber
   * still finds its instance.
   */
  instance(instanceId: string): InstanceRecord | undefined {
    const byKey = this.instanceRecords.get(instanceId);
    if (byKey) return byKey;
    for (const record of this.instanceRecords.values()) {
      if (record.instanceId === instanceId) return record;
    }
    return undefined;
  }

  /**
   * The mounted instance's DISPLAY parent: the innermost OTHER instance
   * whose registered DOM contains this instance's DOM.
   *
   * Containment — not the owner-chain `parentId` — is the truth the tree
   * builds on, because production Solid gives sibling component bodies a
   * SHARED owner: the mount-time stamp walk then finds the PREVIOUS sibling
   * and the tree degenerates into a linked list (hit for real in the built
   * demos; dev builds masked it with per-component debug owners). DOM
   * containment is build-mode-independent. The recorded `parentId` remains
   * as the fallback for headless instances (no elements to contain).
   */
  displayParentId(record: InstanceRecord): string | null {
    const element = [...record.elements].find((el) => el.isConnected);
    if (!element) {
      // Headless: the owner-chain hint is all there is. It may be a sibling
      // in production builds — a root beats a wrong nesting, so only trust
      // it when that parent is still mounted. The hint is a stable KEY;
      // callers want the display id.
      const parent = record.parentId !== null ? this.instanceRecords.get(record.parentId) : undefined;
      return parent?.instanceId ?? null;
    }
    let best: InstanceRecord | null = null;
    let bestDepth = -1;
    for (const other of this.instanceRecords.values()) {
      if (other === record) continue;
      for (const root of other.elements) {
        if (root !== element && root.contains(element)) {
          const depth = domDepth(root);
          if (depth > bestDepth) {
            best = other;
            bestDepth = depth;
          }
          break;
        }
      }
    }
    return best?.instanceId ?? null;
  }

  /**
   * The mounted-component tree, parents from DOM containment (see
   * `displayParentId`).
   *
   * Siblings are ordered by DOCUMENT POSITION, not mount order — the tree
   * has to read like the page. Mount order diverges routinely: a `<For>`
   * row that remounts takes a freed slot and would jump to the end of its
   * list, and a toolbar button that mounts before the rows it sits above
   * would sort with them arbitrarily. Instances with no DOM (headless,
   * hidden) have no position, so they keep mount order among themselves
   * and sort after the positioned ones.
   *
   * A record whose parent is gone (transient teardown windows) surfaces as
   * a root rather than vanishing.
   */
  instanceTree(): InstanceTreeNode[] {
    const nodes = new Map<string, InstanceTreeNode>();
    for (const record of this.instanceRecords.values()) {
      nodes.set(record.instanceId, {
        instanceId: record.instanceId,
        name: record.name,
        kind: record.kind,
        group: record.group,
        children: []
      });
    }
    const rootRecords: InstanceRecord[] = [];
    const childRecords = new Map<string, InstanceRecord[]>();
    for (const record of this.instanceRecords.values()) {
      const parent = this.displayParentId(record);
      if (parent && nodes.has(parent)) {
        const siblings = childRecords.get(parent);
        if (siblings) siblings.push(record);
        else childRecords.set(parent, [record]);
      } else {
        rootRecords.push(record);
      }
    }
    const attach = (records: InstanceRecord[]): InstanceTreeNode[] =>
      // Array.sort is stable, so DOM-less siblings keep mount order.
      [...records].sort(compareDocumentOrder).map((record) => {
        const node = nodes.get(record.instanceId)!;
        node.children.push(...attach(childRecords.get(record.instanceId) ?? []));
        return node;
      });
    return attach(rootRecords);
  }

  /** The mounted instance owning `element` (via its registered roots), or undefined. */
  instanceAt(element: Element): InstanceRecord | undefined {
    let best: InstanceRecord | undefined;
    for (const record of this.instanceRecords.values()) {
      for (const root of record.elements) {
        if (root === element || root.contains(element)) {
          // Innermost wins: prefer the root deepest in the DOM.
          if (!best || [...best.elements].every((other) => other.contains(root))) {
            best = record;
          }
        }
      }
    }
    return best;
  }

  private component(name: string): ComponentRecord {
    let record = this.components.get(name);
    if (!record) {
      record = { name, dependencies: new Set(), queryKeys: new Set() };
      this.components.set(name, record);
    }
    return record;
  }

  /** Full graph snapshot for the debug panel / `window.__wheel`. */
  snapshot(): {
    primitives: Array<{ meta: DebugMeta; value: unknown }>;
    services: DebugServiceRecord[];
    components: Array<{ name: string; dependencies: string[]; queryKeys: string[] }>;
  } {
    return {
      primitives: [...this.primitives.values()].map(({ meta, read }) => ({
        meta,
        value: safeRead(read)
      })),
      services: [...this.services.values()],
      components: [...this.components.values()].map((c) => ({
        name: c.name,
        dependencies: [...c.dependencies],
        queryKeys: [...c.queryKeys]
      }))
    };
  }

  /** Resets the whole graph — used between tests and on hot reload. */
  clear(): void {
    this.primitives.clear();
    this.services.clear();
    this.components.clear();
    this.instanceRecords.clear();
  }
}

/**
 * The registry a component's connect declaration is running under, or null
 * outside connect. connect() sets this around its `declare()` call so `view()`
 * — which builds the read shape but has no handle to the context — can record
 * "the component connecting right now reads this primitive." Module-level and
 * single-threaded on purpose: exactly one connect declaration runs at a time
 * (declare() is synchronous, no awaits), so a stack is unnecessary; connect
 * restores the prior value in a finally to survive nested provider trees.
 */
let activeRegistry: DebugRegistry | null = null;

/** @internal connect() brackets its `declare()` call with this so view() can find the registry. */
export function setActiveRegistry(registry: DebugRegistry | null): void {
  activeRegistry = registry;
}

/**
 * @internal Record that the component currently connecting reads the primitive
 * carrying `meta`. A no-op outside connect (activeRegistry null) — view() is a
 * plain function that also runs in non-connect contexts, where recording is
 * silently skipped.
 */
export function noteActiveRead(meta: DebugMeta): void {
  activeRegistry?.noteDependency(meta);
}

function safeRead(read: () => unknown): unknown {
  try {
    return read();
  } catch (error) {
    return `<read failed: ${error instanceof Error ? error.message : String(error)}>`;
  }
}

/**
 * A props object projected for display.
 *
 * ACCESSOR PROPS ARE NEVER INVOKED. Solid compiles every dynamic prop —
 * `children`, `toolbar={<Bar/>}`, `count={state.count}` — to a getter, and
 * a JSX-valued getter MOUNTS components when read. The debug tree re-renders
 * whenever an instance registers, so reading such a getter from debug chrome
 * mounts → registers → re-renders → reads again: an infinite mount loop
 * (froze the graph demo's page at 400% CPU via DemoStage's `children` and
 * `toolbar`). `untrack` cannot break that loop — it is driven by instance
 * churn, not subscriptions — so the only safe read is no read: accessors
 * render as `<jsx children>` / `<reactive key>` markers, and only plain
 * data properties (Solid's compilation of static props) show their values.
 *
 * Non-data plain values are named, never expanded: a callback shows as
 * `<fn onSave>` and a DOM node as `<Element div>`. That keeps the panel
 * honest without letting a huge object graph or a live handle into the tree.
 */
function readProps(props: object): Record<string, unknown> {
  return untrack(() => {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(props)) {
      const descriptor = Object.getOwnPropertyDescriptor(props, key);
      if (descriptor?.get) {
        out[key] = key === 'children' ? '<jsx children>' : `<reactive ${key}>`;
        continue;
      }
      const value = safeRead(() => (props as Record<string, unknown>)[key]);
      if (typeof value === 'function') {
        out[key] = `<fn ${(value as { name?: string }).name || key}>`;
      } else if (typeof Element !== 'undefined' && value instanceof Element) {
        out[key] = `<Element ${value.tagName.toLowerCase()}>`;
      } else {
        out[key] = value;
      }
    }
    return out;
  });
}

/**
 * A connect shape's live reads: own enumerable getters are reads (view()
 * produces exactly this; hand-written getter shapes match too), evaluated
 * fresh on every call. Plain function values are actions — skipped here.
 */
function shapeState(shape: object): Record<string, unknown> {
  const state: Record<string, unknown> = {};
  const descriptors = Object.getOwnPropertyDescriptors(shape);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (descriptor.get) {
      state[key] = safeRead(() => (shape as Record<string, unknown>)[key]);
    } else if (typeof descriptor.value !== 'function' && descriptor.enumerable) {
      state[key] = descriptor.value;
    }
  }
  return state;
}

/** A connect shape's action names (plain function-valued properties). */
function shapeActions(shape: object): readonly string[] {
  const actions: string[] = [];
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(shape))) {
    if (!descriptor.get && typeof descriptor.value === 'function') {
      actions.push(key);
    }
  }
  return actions;
}
