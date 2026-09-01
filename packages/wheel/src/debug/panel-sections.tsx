/**
 * The debug surfaces' shared section library: the expandable JSON tree and
 * the audit sections (service state, component manifests, client collections /
 * subscriptions / provenance stream). Two chromes render these — the
 * floating `<WheelDebugPanel/>` widget and `<WheelApp/>`'s docked panel — so
 * the sections live here, chrome-free, taking their context as props.
 *
 * Colors: both chromes are INSTRUMENT surfaces — deliberately dark whatever
 * the app's theme is doing — so these styles read the FIXED `--wheel-stage-*`
 * and status tokens, never the theme aliases, and every value keeps its
 * original literal as the fallback for hosts that never load `wheel/styles`.
 *
 * Reactivity contract: client reads ride the context revision (`trackVersion`),
 * service field VALUES ride `trackDebug`, and instance churn — mounts,
 * unmounts, renames, visibility — rides `trackInstances`. Three wires, because
 * they change at wildly different rates and a surface that redraws on the
 * slowest must not redraw on the fastest.
 */
// wheel-view-root: debug chrome — must not appear in the tree it renders
// wheel-untracked-show: debug chrome — excluded from the component tree it renders
import { createMemo, createSignal, For, Show, type JSX } from 'solid-js';

import { causeMutations, type ProvenanceEntry, type WriteCause } from '../sync/client/provenance';
import type { SyncClient } from '../sync/client/client';
import type { DebugMeta, InstanceRecord } from '../core/debug-registry';
import type { ServiceContext } from '../core/services';

import { InspectorService } from './inspector';

/** Cause → color for the provenance stream rows. */
export const CAUSE_COLORS: Record<WriteCause['kind'], string> = {
  bootstrap: 'var(--wheel-stage-ink-faint, #8b8b8b)',
  hydrate: 'var(--wheel-indigo-deep, #6d28d9)',
  optimistic: 'var(--wheel-warn-ink, #b45309)',
  'sync-apply': 'var(--wheel-ok-ink, #0f766e)',
  rollback: 'var(--wheel-danger-deep, #b91c1c)',
  orphaned: 'var(--wheel-danger-deep, #b91c1c)'
};

/** The shared row/tree styles both chromes compose. */
export const sectionStyles = {
  sectionTitle: {
    margin: '8px 0 4px',
    color: 'var(--wheel-stage-ink-faint, #8b8b8b)',
    'text-transform': 'uppercase',
    'letter-spacing': '0.5px',
    'font-size': '9.5px'
  },
  /**
   * A pane's OWN heading, pinned while its content scrolls — the components
   * header carries the ⌖ picker, and losing it three screens into a tree is
   * the moment you want it. Only the heading that opens a pane gets this;
   * the sub-headings inside one (collections/subscriptions/change stream) scroll
   * normally, or they would stack on top of each other.
   */
  paneTitle: {
    position: 'sticky',
    top: '-4px',
    'z-index': 1,
    margin: '0 0 4px',
    padding: '6px 0 4px',
    background: 'var(--wheel-stage-5, #202124)',
    color: 'var(--wheel-stage-ink-faint, #8b8b8b)',
    'text-transform': 'uppercase',
    'letter-spacing': '0.5px',
    'font-size': '9.5px'
  },
  row: {
    display: 'flex',
    gap: '6px',
    padding: '1px 0',
    'white-space': 'nowrap',
    overflow: 'hidden',
    'text-overflow': 'ellipsis'
  },
  summary: {
    display: 'flex',
    gap: '6px',
    padding: '1px 0',
    cursor: 'pointer',
    'user-select': 'none',
    'align-items': 'center',
    // A tree row is one line: a long name is cut, not wrapped, and never
    // widens the pane into a horizontal scroll.
    'min-width': 0
  },
  /** The label itself, which is the part that gets cut. */
  summaryLabel: {
    overflow: 'hidden',
    'text-overflow': 'ellipsis',
    'white-space': 'nowrap',
    'min-width': 0
  },
  /** Where a caret would be, for rows that have nothing to open. */
  caretSpacer: { width: '9px', 'flex-shrink': 0 },
  indent: { 'padding-left': '12px' },
  dim: { color: 'var(--wheel-stage-ink-faint, #8b8b8b)' },
  badge: { color: 'var(--wheel-ok-soft, #2dd4bf)' }
} satisfies Record<string, JSX.CSSProperties>;

function scalarColor(value: unknown): string {
  const type = typeof value;
  if (type === 'string') return 'var(--wheel-ok-soft, #7dd3a8)';
  if (type === 'number') return 'var(--wheel-indigo-edge, #93c5fd)';
  if (type === 'boolean') return 'var(--wheel-warn, #fcd34d)';
  return 'var(--wheel-stage-ink-faint, #8b8b8b)';
}

function formatScalar(value: unknown): string {
  if (typeof value === 'string') {
    return JSON.stringify(value.length > 60 ? `${value.slice(0, 57)}…` : value);
  }
  if (typeof Node !== 'undefined' && value instanceof Node) {
    if (value instanceof Element) {
      const id = value.id ? `#${value.id}` : '';
      const cls = value.classList.length > 0 ? `.${value.classList[0]}` : '';
      return `<${value.tagName.toLowerCase()}${id}${cls}>`;
    }
    return `<${value.nodeName.toLowerCase()}>`;
  }
  return String(value);
}

function isComplex(value: unknown): value is object {
  // DOM nodes are cyclic (parentNode/ownerDocument) and huge; the panel
  // shows them as one-line scalars instead of walkable objects.
  if (typeof Node !== 'undefined' && value instanceof Node) return false;
  return value !== null && typeof value === 'object';
}

function childEntries(value: object): Array<readonly [string, unknown]> {
  if (Array.isArray(value)) return value.map((item, index) => [String(index), item] as const);
  if (value instanceof Set) return [...value].map((item, index) => [String(index), item] as const);
  if (value instanceof Map) return [...value.entries()].map(([key, item]) => [String(key), item] as const);
  return Object.entries(value);
}

function preview(value: object): string {
  if (Array.isArray(value)) return `[${value.length}]`;
  if (value instanceof Set) return `Set(${value.size})`;
  if (value instanceof Map) return `Map(${value.size})`;
  return `{${Object.keys(value).length}}`;
}

/**
 * Snapshot rows are recreated on every change, so expansion state cannot live
 * in the rows themselves — it lives in one durable path set per chrome.
 */
export interface ExpandState {
  readonly expanded: (path: string) => boolean;
  readonly toggle: (path: string) => void;
  /** Force a path OPEN regardless of current state (`defaultOpen` = the node's default). */
  readonly expand: (path: string, defaultOpen?: boolean) => void;
}

/** One durable toggled-path set (see ExpandState). */
export function createExpandState(): ExpandState {
  const [toggledPaths, setToggledPaths] = createSignal<Set<string>>(new Set(), { equals: false });
  return {
    expanded: (path) => toggledPaths().has(path),
    toggle: (path) =>
      setToggledPaths((paths) => {
        if (!paths.delete(path)) paths.add(path);
        return paths;
      }),
    // Toggled paths XOR the default: open = present for default-closed
    // nodes, ABSENT for default-open ones.
    expand: (path, defaultOpen = false) =>
      setToggledPaths((paths) => {
        if (defaultOpen) paths.delete(path);
        else paths.add(path);
        return paths;
      })
  };
}

/** Disclosure row: ▸/▾ + label (+ dim summary), children indented under it. */
export function Expandable(props: {
  path: string;
  label: string;
  summary?: string;
  defaultOpen?: boolean;
  ex: ExpandState;
  /**
   * Color for the label — used by the component tree to set METADATA groups
   * (a component's state, its actions) apart from its structural CHILDREN,
   * which are the same kind of thing as the node itself.
   */
  accent?: string;
  /** Glyph before the label, for the same distinction. */
  icon?: string;
  /**
   * Whether this row opens at all.
   *
   * A childless component has nothing to reveal, so it gets no caret — and a
   * caret that does nothing is worse than none. It keeps the caret's WIDTH,
   * so every label in the tree still starts at the same place.
   */
  expandable?: boolean;
  /** Extra hover wiring for the label row (the component tree uses this to highlight). */
  onRowEnter?: () => void;
  onRowLeave?: () => void;
  /**
   * A control between the caret and the label, where an icon would be.
   *
   * It sits INSIDE the row so it lines up with everything else, but outside
   * the row's own click target — the component tree puts its inspect toggle
   * here, and pressing that must not also expand the node.
   */
  leading?: JSX.Element;
  children: JSX.Element;
}): JSX.Element {
  // Toggled paths XOR the default, so one set serves both default-open groups
  // and default-closed trees.
  const expandable = (): boolean => props.expandable ?? true;
  const open = (): boolean =>
    expandable() && props.ex.expanded(props.path) !== (props.defaultOpen ?? false);
  return (
    <div>
      <div
        style={sectionStyles.summary}
        data-tree-row=""
        onClick={() => expandable() && props.ex.toggle(props.path)}
        onMouseEnter={props.onRowEnter}
        onMouseLeave={props.onRowLeave}
      >
        <Show
          when={expandable()}
          fallback={<span style={sectionStyles.caretSpacer} aria-hidden="true" />}
        >
          <span style={sectionStyles.dim}>{open() ? '▾' : '▸'}</span>
        </Show>
        <Show when={props.leading}>
          <span style={{ 'flex-shrink': 0 }} onClick={(event) => event.stopPropagation()}>
            {props.leading}
          </span>
        </Show>
        <Show when={props.icon}>
          <span style={{ color: props.accent ?? 'var(--wheel-stage-ink-faint, #8b8b8b)' }}>{props.icon}</span>
        </Show>
        <span
          style={{ ...sectionStyles.summaryLabel, ...(props.accent ? { color: props.accent } : {}) }}
          title={props.label}
        >
          {props.label}
        </span>
        <Show when={props.summary}>
          <span style={sectionStyles.dim}>{props.summary}</span>
        </Show>
      </div>
      <Show when={open()}>
        <div style={sectionStyles.indent}>{props.children}</div>
      </Show>
    </div>
  );
}

/** Recursive JSON tree: scalars inline, objects/arrays/Set/Map expandable. */
export function JsonTree(props: {
  path: string;
  label: string;
  value: unknown;
  ex: ExpandState;
  defaultOpen?: boolean;
}): JSX.Element {
  return (
    <Show
      when={isComplex(props.value)}
      fallback={
        <div style={sectionStyles.row}>
          <span style={sectionStyles.dim}>{props.label}:</span>
          <span style={{ color: scalarColor(props.value) }}>{formatScalar(props.value)}</span>
        </div>
      }
    >
      <Expandable
        path={props.path}
        label={props.label}
        summary={preview(props.value as object)}
        ex={props.ex}
        defaultOpen={props.defaultOpen}
      >
        <For each={childEntries(props.value as object)}>
          {([key, nested]) => (
            <JsonTree path={`${props.path}.${key}`} label={key} value={nested} ex={props.ex} />
          )}
        </For>
      </Expandable>
    </Show>
  );
}

interface PrimitiveEntry {
  meta: DebugMeta;
  value: unknown;
}

function PrimitiveRow(props: { entry: PrimitiveEntry; ex: ExpandState }): JSX.Element {
  return (
    <div data-primitive={props.entry.meta.name}>
      <Show
        when={isComplex(props.entry.value)}
        fallback={
          <div style={sectionStyles.row}>
            <span>{props.entry.meta.name}</span>
            <span style={sectionStyles.dim}>{props.entry.meta.kind}</span>
            <span style={{ color: scalarColor(props.entry.value) }}>{formatScalar(props.entry.value)}</span>
          </div>
        }
      >
        <JsonTree
          path={`primitive:${props.entry.meta.id}`}
          label={`${props.entry.meta.name} · ${props.entry.meta.kind}`}
          value={props.entry.value}
          ex={props.ex}
          defaultOpen={props.entry.meta.kind === 'machine' || props.entry.meta.kind === 'field'}
        />
      </Show>
    </div>
  );
}

interface ServiceGroup {
  id: string;
  name: string;
  scopeId: string;
  group: string;
  primitives: PrimitiveEntry[];
}

/**
 * The service → primitive groups from the live registry snapshot. liveQuery
 * primitives register at call time, after the owning service's field walk —
 * they surface in a trailing `(unowned)` group instead of being dropped.
 */
function serviceGroups(services: ServiceContext): ServiceGroup[] {
  const snapshot = services.registry.snapshot();
  const byId = new Map(snapshot.primitives.map((entry) => [entry.meta.id, entry] as const));
  const claimed = new Set<string>();
  const groups: ServiceGroup[] = [];
  for (const service of snapshot.services) {
    const primitives: PrimitiveEntry[] = [];
    for (const id of service.primitiveIds) {
      const entry = byId.get(id);
      if (entry) {
        claimed.add(id);
        primitives.push(entry);
      }
    }
    groups.push({
      id: service.id,
      name: service.name,
      scopeId: service.scopeId,
      group: service.group,
      primitives
    });
  }
  const unowned = snapshot.primitives.filter((entry) => !claimed.has(entry.meta.id));
  if (unowned.length > 0) {
    groups.push({ id: 'unowned', name: '(unowned)', scopeId: '', group: 'app', primitives: unowned });
  }
  return groups;
}

function ServiceRows(props: {
  entries: ServiceGroup[];
  ex: ExpandState;
  defaultOpen: boolean;
}): JSX.Element {
  // Actions carry no live value worth a row each (`<action set>` was noise) —
  // they collapse into one default-closed `actions` dictionary of names.
  const split = (service: ServiceGroup) => ({
    values: service.primitives.filter((entry) => entry.meta.kind !== 'action'),
    actions: service.primitives.filter((entry) => entry.meta.kind === 'action')
  });
  return (
    <For each={props.entries}>
      {(service) => {
        const parts = split(service);
        return (
          <Expandable
            path={`service:${service.id}`}
            label={service.name}
            summary={`${service.scopeId ? `${service.scopeId} ` : ''}(${parts.values.length})`}
            defaultOpen={props.defaultOpen}
            ex={props.ex}
          >
            <For each={parts.values}>{(entry) => <PrimitiveRow entry={entry} ex={props.ex} />}</For>
            <Show when={parts.actions.length > 0}>
              <Expandable
                path={`service:${service.id}:actions`}
                label="actions"
                summary={`(${parts.actions.length})`}
                ex={props.ex}
              >
                <For each={parts.actions}>
                  {(entry) => <div style={sectionStyles.row}><span style={sectionStyles.dim}>{entry.meta.name}</span></div>}
                </For>
              </Expandable>
            </Show>
          </Expandable>
        );
      }}
    </For>
  );
}

/**
 * "state tree": every service and its primitives' live values, organized by
 * the class-level `static group`:
 *
 * - `app` (and any custom group) renders as an OPEN group — the state you
 *   wrote is the state you see;
 * - `framework` (wheel's kit/router internals) renders COLLAPSED — present
 *   when you need it, out of the way when you don't;
 * - `debug` (wheel's own debug services) is not rendered at all — the panel
 *   must not list the machinery of the panel. The bridge still reports it.
 */
export function ServiceStateSection(props: {
  services: ServiceContext;
  ex: ExpandState;
  /** Whether SERVICE rows inside open groups start expanded (floating panel: yes). */
  defaultOpen?: boolean;
}): JSX.Element {
  const partitioned = createMemo(() => {
    props.services.trackVersion();
    // Values AND shape: a field write changes what a row shows, a mount can
    // bring a whole service with it.
    props.services.trackDebug();
    props.services.trackInstances();
    const all = serviceGroups(props.services).filter((entry) => entry.group !== 'debug');
    const custom = [...new Set(all.map((entry) => entry.group))]
      .filter((name) => name !== 'app' && name !== 'framework')
      .sort();
    return {
      app: all.filter((entry) => entry.group === 'app'),
      custom: custom.map((name) => ({ name, entries: all.filter((entry) => entry.group === name) })),
      framework: all.filter((entry) => entry.group === 'framework')
    };
  });
  const rowsOpen = (): boolean => props.defaultOpen ?? false;
  return (
    <>
      <div style={sectionStyles.paneTitle}>state tree</div>
      <Show when={partitioned().app.length > 0}>
        <Expandable path="services:app" label="App" summary={`(${partitioned().app.length})`} defaultOpen ex={props.ex}>
          <ServiceRows entries={partitioned().app} ex={props.ex} defaultOpen={rowsOpen()} />
        </Expandable>
      </Show>
      <For each={partitioned().custom}>
        {(group) => (
          <Expandable
            path={`services:${group.name}`}
            label={group.name}
            summary={`(${group.entries.length})`}
            defaultOpen
            ex={props.ex}
          >
            <ServiceRows entries={group.entries} ex={props.ex} defaultOpen={rowsOpen()} />
          </Expandable>
        )}
      </For>
      <Show when={partitioned().framework.length > 0}>
        <Expandable
          path="services:framework"
          label="Framework"
          summary={`(${partitioned().framework.length})`}
          ex={props.ex}
        >
          <ServiceRows entries={partitioned().framework} ex={props.ex} defaultOpen={rowsOpen()} />
        </Expandable>
      </Show>
    </>
  );
}

/**
 * "components" (manifest view): each component's declared dependencies and
 * query keys, plus its mounted instances with hover-to-locate. This is the
 * MANIFEST answer ("what does TodoRow depend on"); the component TREE lives
 * in `component-tree.tsx`.
 */
export function ComponentManifestSection(props: { services: ServiceContext; ex: ExpandState }): JSX.Element {
  const components = createMemo(() => {
    props.services.trackVersion();
    props.services.trackInstances();
    return props.services.registry.snapshot().components;
  });
  const instancesOf = (name: string): readonly InstanceRecord[] => {
    // Instance churn rides its OWN channel — never the data revision (the
    // shared wire caused a mount feedback loop; see ServiceContext).
    props.services.trackInstances();
    return props.services.registry.instances().filter((instance) => instance.name === name);
  };
  return (
    <>
      <div style={sectionStyles.sectionTitle}>components</div>
      <For each={components()}>
        {(component) => (
          <Expandable
            path={`component:${component.name}`}
            label={component.name}
            summary={`(${component.dependencies.length})`}
            defaultOpen
            ex={props.ex}
          >
            <For each={component.dependencies}>
              {(dependency) => (
                <div style={sectionStyles.row}>
                  <span style={sectionStyles.dim}>{dependency}</span>
                </div>
              )}
            </For>
            <For each={component.queryKeys}>
              {(key) => (
                <div style={sectionStyles.row}>
                  <span style={sectionStyles.badge}>query</span>
                  <span style={sectionStyles.dim}>{key}</span>
                </div>
              )}
            </For>
            {/* Mounted instances: hover locates the component on the
                page (inset outline, no layout shift). */}
            <For each={instancesOf(component.name)}>
              {(instance) => (
                <div
                  style={{ ...sectionStyles.row, cursor: 'pointer' }}
                  onMouseEnter={() => props.services.get(InspectorService).highlight(instance.instanceId)}
                  onMouseLeave={() => props.services.get(InspectorService).highlight(null)}
                >
                  <span style={sectionStyles.badge}>mounted</span>
                  <span style={sectionStyles.dim}>
                    {instance.instanceId}
                    {instance.elements.size === 0 ? ' (no root marked)' : ''}
                  </span>
                </div>
              )}
            </For>
          </Expandable>
        )}
      </For>
    </>
  );
}

function causeLabel(cause: WriteCause): JSX.Element {
  return (
    <span style={{ color: CAUSE_COLORS[cause.kind] }}>
      {cause.kind}
      {/* The mutation names come from the sync layer, which owns what a cause
          contains — see `causeMutations`. Reading the union here is how the
          annotator and the tracker both silently lost these names once. */}
      <span style={sectionStyles.dim}>
        {' '}
        {'seq' in cause ? `seq ${cause.seq}` : causeMutations(cause).join(', ')}
      </span>
    </span>
  );
}

/** Client-backed sections: collection cache, subscriptions, provenance stream. Renders nothing clientless. */
export function ClientSections(props: {
  services: ServiceContext;
  client: SyncClient | null;
  ex: ExpandState;
}): JSX.Element {
  // Client-backed reads: rev() subscribes them to the client's change channel
  // (every onChange bumps the context revision signal).
  const rev = (): number => props.services.trackVersion();
  const collections = (): Array<{ collection: string; rows: readonly Record<string, unknown>[] }> => {
    rev();
    return props.client?.collectionsDebug() ?? [];
  };
  const subscriptions = (): Array<{ key: string; subscriptionId: string; refs: number; rows: number }> => {
    rev();
    return props.client?.subscriptionsDebug() ?? [];
  };
  const writes = (): readonly ProvenanceEntry[] => {
    rev();
    return props.client?.recentWrites(30) ?? [];
  };
  return (
    <Show when={props.client !== null}>
      <div style={sectionStyles.sectionTitle}>collections</div>
      <For each={collections()}>
        {(entry) => (
          <Expandable path={`collection:${entry.collection}`} label={entry.collection} summary={`(${entry.rows.length})`} ex={props.ex}>
            <For each={entry.rows}>
              {(row, index) => {
                const id = String(row.id ?? index());
                return <JsonTree path={`collection:${entry.collection}.${id}`} label={id} value={row} ex={props.ex} />;
              }}
            </For>
          </Expandable>
        )}
      </For>
      <div style={sectionStyles.sectionTitle}>subscriptions</div>
      <For each={subscriptions()}>
        {(subscription) => (
          <div style={sectionStyles.row}>
            <span>{subscription.key}</span>
            <span style={sectionStyles.dim}>
              rows {subscription.rows} · refs {subscription.refs}
            </span>
          </div>
        )}
      </For>
      <div style={sectionStyles.sectionTitle}>change stream (newest last)</div>
      <div data-testid="wheel-debug-stream">
        <For each={writes()}>
          {(entry) => (
            <div style={sectionStyles.row}>
              <span style={sectionStyles.dim}>
                {entry.collection}/{entry.rowId}
              </span>
              {causeLabel(entry.cause)}
              <Show when={entry.value === undefined}>
                <span style={{ color: 'var(--wheel-danger-deep, #b91c1c)' }}>deleted</span>
              </Show>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}
