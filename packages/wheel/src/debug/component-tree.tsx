/**
 * The component TREE section: every mounted instance — connected and (in
 * dev) view-registered dumb components — nested by DOM containment, split
 * into two buckets like the state tree: **App** (your components, open) and
 * **Framework** (wheel's kit/router components, collapsed). `*System` hosts
 * are lifted out of the visual nesting to the top of their bucket (headless
 * systems have no DOM to containment-place).
 *
 * Interactions: hover a row → the instance lights up in place; expand a
 * connected instance → an accented `◆ connected` group (open by default —
 * the values this component reads through connect()) and a `ƒ actions`
 * group (closed), visually set apart from the component rows that are its
 * actual children. A component that renders nothing is marked
 * `⊘ hidden` (a wheel `<Show>` said no) or `⊘ no DOM` (headless, or a
 * missing root marker). The ⌖ button next to the title is the
 * chrome-devtools-style element picker: hover the app to highlight the
 * component under the cursor, click to reveal it in the tree (expanded,
 * scrolled into view, row highlighted). Escape cancels.
 */
// wheel-view-root: debug chrome — must not appear in the tree it renders
// wheel-raw-signal: same reason — this chrome registers no instance, so a
// named signal would be recorded against whatever app component happens to
// be its nearest registered ancestor
import { createEffect, createMemo, createSignal, onCleanup, For, Show, type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';

import type { DebugRegistry, InstanceRecord, InstanceTreeNode } from '../core/debug-registry';
import type { ServiceContext } from '../core/services';

import { InspectorService } from './inspector';
import { Frame } from '../kit';

import { Expandable, JsonTree, sectionStyles, type ExpandState } from './panel-sections';

/**
 * WheelApp's own chrome registers like everything else — honest in the
 * bridge, noise in the DISPLAY. The tree section hides those nodes and
 * hoists their children, so the app's components sit at the root where they
 * belong. `window.__wheel.components()` stays unfiltered.
 */
function isChrome(instanceId: string): boolean {
  return /^(InspectorSystem|SnapshotSystem)(#|$)/.test(instanceId);
}

function prune(nodes: InstanceTreeNode[]): InstanceTreeNode[] {
  return nodes.flatMap((node) =>
    isChrome(node.instanceId) ? prune(node.children) : [{ ...node, children: prune(node.children) }]
  );
}

/**
 * `*System` hosts are real components but not part of the app's VISUAL
 * composition — and the headless ones can be stranded under arbitrary
 * neighbors in production builds (no DOM, owner hints lie there). Lift them
 * out of the nesting at EVERY depth; they render at the top level of their
 * bucket instead. Their children (rare) hoist into their old spot.
 */
function isSystem(node: InstanceTreeNode): boolean {
  return /System(#\d+)?$/.test(node.instanceId);
}

function extractSystems(nodes: InstanceTreeNode[], systems: InstanceTreeNode[]): InstanceTreeNode[] {
  return nodes.flatMap((node) => {
    if (isSystem(node)) {
      systems.push({ ...node, children: [] });
      return extractSystems(node.children, systems);
    }
    return [{ ...node, children: extractSystems(node.children, systems) }];
  });
}

/**
 * A component's own data reads in a different color from the component
 * rows around it — the tree is structure, these are its contents.
 */
const META_COLORS = {
  props: 'var(--wheel-indigo-edge, #93c5fd)',
  connected: 'var(--wheel-violet-soft, #c084fc)',
  local: 'var(--wheel-warn, #fbbf24)',
  actions: 'var(--wheel-ok-soft, #7dd3a8)',
  list: 'var(--wheel-stage-ink-faint, #8b93a3)'
} as const;

/**
 * Siblings that share a name are a LIST, and a list of twenty rows buries
 * everything around it. Two or more same-named siblings collapse into one
 * `TodoRow[] (3)` node, closed by default, so the components beside the
 * list stay visible. Grouping is display-only — `__wheel.components()`
 * still returns the flat, honest tree — and it kicks in at exactly the
 * point ids start carrying numbers, so `TodoRow[]` contains precisely the
 * `TodoRow#N`s.
 */
type DisplayChild =
  | { readonly kind: 'node'; readonly node: InstanceTreeNode }
  | { readonly kind: 'list'; readonly name: string; readonly members: InstanceTreeNode[] };

function groupSiblings(nodes: InstanceTreeNode[]): DisplayChild[] {
  const counts = new Map<string, number>();
  for (const node of nodes) counts.set(node.name, (counts.get(node.name) ?? 0) + 1);
  const out: DisplayChild[] = [];
  const emitted = new Set<string>();
  for (const node of nodes) {
    if ((counts.get(node.name) ?? 0) < 2) {
      out.push({ kind: 'node', node });
      continue;
    }
    // The group takes the position of its FIRST member, so a list keeps its
    // place among its siblings instead of jumping to the end.
    if (emitted.has(node.name)) continue;
    emitted.add(node.name);
    out.push({ kind: 'list', name: node.name, members: nodes.filter((other) => other.name === node.name) });
  }
  return out;
}

/** Renders one child slot: a plain instance, or a collapsed same-name list. */
function TreeChildren(props: {
  nodes: InstanceTreeNode[];
  parentPath: string;
  services: ServiceContext;
  ex: ExpandState;
  selected: () => string | null;
  reveal: (instanceId: string) => void;
  inspected: () => string | null;
  inspect: (key: string | null) => void;
}): JSX.Element {
  return (
    <For each={groupSiblings(props.nodes)}>
      {(child) =>
        child.kind === 'node' ? (
          <TreeNode
            node={child.node}
            services={props.services}
            ex={props.ex}
            selected={props.selected}
            reveal={props.reveal}
            inspected={props.inspected}
            inspect={props.inspect}
          />
        ) : (
          <Expandable
            path={`${props.parentPath}:list:${child.name}`}
            label={`${child.name}[]`}
            summary={`(${child.members.length})`}
            accent={META_COLORS.list}
            ex={props.ex}
            // A group stands for its members, so hovering it shows ALL of
            // them. It used to show nothing, which read as a dead row — and
            // since the component library joined the tree, a collapsed list is
            // most of what a reader hovers.
            onRowEnter={() =>
              props.services
                .get(InspectorService)
                .highlight(child.members.map((member) => member.instanceId))
            }
            onRowLeave={() => props.services.get(InspectorService).highlight(null)}
          >
            <For each={child.members}>
              {(member) => (
                <TreeNode
                  node={member}
                  services={props.services}
                  ex={props.ex}
                  selected={props.selected}
                  reveal={props.reveal}
                  inspected={props.inspected}
                  inspect={props.inspect}
                />
              )}
            </For>
          </Expandable>
        )
      }
    </For>
  );
}

/**
 * The `children` prop, as the components it actually mounted.
 *
 * It used to read `<jsx children>`, and that marker is not laziness — reading a
 * JSX getter MOUNTS what it returns, and the tree re-renders whenever an
 * instance registers, so reading it here is a mount loop (it froze the graph
 * demo at 400% CPU). Nothing is read now either: these are the child nodes the
 * tree already has, which is what the prop produced.
 *
 * Each one selects its row, so `children` is a way THROUGH the tree rather
 * than a dead end.
 */
function ChildLinks(props: {
  node: InstanceTreeNode;
  services: ServiceContext;
  reveal: (instanceId: string) => void;
}): JSX.Element {
  const highlight = (id: string | null): void => props.services.get(InspectorService).highlight(id);
  const count = (): number => props.node.children.length;
  return (
    <>
      <div style={sectionStyles.row}>
        <span style={sectionStyles.dim}>children:</span>
        <span style={sectionStyles.dim}>
          {count() > 0 ? `(${count()})` : 'nothing wheel can see'}
        </span>
      </div>
      <For each={props.node.children}>
        {(child) => (
          <button
            type="button"
            data-testid="wheel-tree-child-link"
            style={childLinkStyle}
            title={`reveal ${child.instanceId}`}
            onClick={() => props.reveal(child.instanceId)}
            onMouseEnter={() => highlight(child.instanceId)}
            onMouseLeave={() => highlight(null)}
          >
            {child.instanceId}
          </button>
        )}
      </For>
    </>
  );
}

/** A child link reads as a link, not as a value. */
const childLinkStyle = {
  display: 'block',
  padding: '1px 0 1px 12px',
  border: 'none',
  background: 'none',
  color: 'var(--wheel-indigo-edge, #93c5fd)',
  font: 'inherit',
  cursor: 'pointer',
  'text-align': 'left',
  'text-decoration': 'underline'
} satisfies JSX.CSSProperties;

/**
 * Whether a value is carrying no information.
 *
 * `false`, `null`, `undefined` and `''` are what a component reports for the
 * things nobody asked about. A `0` is NOT one of them — a count of zero is a
 * fact, and hiding it would be hiding an answer.
 */
function isUnset(value: unknown): boolean {
  return value === false || value === null || value === undefined || value === '';
}

/**
 * A group of values, with the empty ones folded away.
 *
 * `CheckboxRoot` reports twelve keys and eleven of them say `false`. Every one
 * is true and almost none of it is what you opened the panel for, so the ones
 * carrying nothing collapse behind a count you can press. Nothing is hidden
 * permanently — this is about what to read FIRST.
 */
function ValueGroup(props: {
  entries: () => Array<readonly [string, unknown]>;
  path: string;
  ex: ExpandState;
}): JSX.Element {
  const set = (): Array<readonly [string, unknown]> => props.entries().filter(([, v]) => !isUnset(v));
  const unset = (): Array<readonly [string, unknown]> => props.entries().filter(([, v]) => isUnset(v));
  const showUnset = (): boolean => props.ex.expanded(`${props.path}::unset`);
  return (
    <>
      <For each={set()}>
        {([key, value]) => (
          <JsonTree path={`${props.path}.${key}`} label={key} value={value} ex={props.ex} />
        )}
      </For>
      <Show when={unset().length > 0}>
        <div
          style={{ ...sectionStyles.row, cursor: 'pointer' }}
          data-testid="wheel-tree-unset-toggle"
          onClick={() => props.ex.toggle(`${props.path}::unset`)}
        >
          <span style={sectionStyles.dim}>
            {showUnset() ? '▾' : '…'} {unset().length} unset
          </span>
        </div>
        <Show when={showUnset()}>
          <For each={unset()}>
            {([key, value]) => (
              <JsonTree path={`${props.path}.${key}`} label={key} value={value} ex={props.ex} />
            )}
          </For>
        </Show>
      </Show>
    </>
  );
}

/**
 * One component's own data: what it was given, what it keeps, what it can do.
 *
 * A SUB-VIEW rather than rows nested in the tree. Four groups inline under
 * every open node made the tree impossible to scan — the structure you came
 * for was buried under the values you did not. The tree is now only the tree;
 * this opens beneath it for the one component you asked about.
 */
function ComponentDetail(props: {
  node: InstanceTreeNode;
  services: ServiceContext;
  ex: ExpandState;
  reveal: (instanceId: string) => void;
  close: () => void;
}): JSX.Element {
  const record = () => props.services.registry.instance(props.node.instanceId);
  const liveProps = createMemo<Record<string, unknown>>(() => {
    props.services.trackVersion();
    return record()?.props() ?? {};
  });
  const liveState = createMemo<Record<string, unknown>>(() => {
    props.services.trackVersion();
    return record()?.state() ?? {};
  });
  return (
    <>
      <div style={detailStyles.header}>
        <span style={{ color: 'var(--wheel-stage-ink-strong, #e5e7eb)' }}>{props.node.instanceId}</span>
        <button
          type="button"
          style={detailStyles.close}
          data-testid="wheel-tree-detail-close"
          aria-label="close the inspector"
          onClick={props.close}
        >
          ✕
        </button>
      </div>
    {/* A component's own DATA (state, actions) vs its CHILDREN are
        different kinds of thing, and rendering them as peer rows made
        the tree hard to read. Both now sit in accented, icon-marked
        groups: `state` opens by default (reaching it should cost no
        clicks), `actions` stays closed (names only, no values). */}
    <Show when={record()}>
      {(instanceRecord) => (
        <>
          {/* PROPS first: what the parent handed this component, before
              what the component derived from services. */}
          <Show when={Object.keys(liveProps()).length > 0}>
            <Expandable
              path={`tree:${props.node.key}:props`}
              label="props"
              summary={`{${Object.keys(liveProps()).length}}`}
              accent={META_COLORS.props}
              icon="▪"
              defaultOpen
              ex={props.ex}
            >
              <Show when={'children' in liveProps()}>
                <ChildLinks node={props.node} services={props.services} reveal={props.reveal} />
              </Show>
              <ValueGroup
                entries={() => Object.entries(liveProps()).filter(([key]) => key !== 'children')}
                path={`tree:${props.node.key}:props`}
                ex={props.ex}
              />
            </Expandable>
          </Show>
          {/* Component-LOCAL signals (useSignal), distinct from the
              connect shape: this state belongs to this instance alone. */}
          <Show when={instanceRecord().locals.length > 0}>
            <Expandable
              path={`tree:${props.node.key}:local`}
              label="local"
              summary={`(${instanceRecord().locals.length})`}
              accent={META_COLORS.local}
              icon="●"
              defaultOpen
              ex={props.ex}
            >
              <For each={instanceRecord().locals}>
                {(local) => (
                  <JsonTree
                    path={`tree:${props.node.key}:local.${local.name}`}
                    label={local.name}
                    value={local.read()}
                    ex={props.ex}
                  />
                )}
              </For>
            </Expandable>
          </Show>
          <Show when={Object.keys(liveState()).length > 0}>
            <Expandable
              path={`tree:${props.node.key}:connected`}
              // `connected` is a connect() shape: the values a component pulled
              // from services. A view component has no shape — what it
              // publishes is its own state, and calling that "connected" said
              // something untrue about where it came from.
              label={props.node.kind === 'view' ? 'state' : 'connected'}
              summary={`{${Object.keys(liveState()).length}}`}
              accent={META_COLORS.connected}
              icon="◆"
              defaultOpen
              ex={props.ex}
            >
              <ValueGroup
                entries={() => Object.entries(liveState())}
                path={`tree:${props.node.key}:state`}
                ex={props.ex}
              />
            </Expandable>
          </Show>
          <Show when={instanceRecord().actions.length > 0}>
            <Expandable
              path={`tree:${props.node.key}:actions`}
              label="actions"
              summary={`(${instanceRecord().actions.length})`}
              accent={META_COLORS.actions}
              icon="ƒ"
              ex={props.ex}
            >
              <For each={instanceRecord().actions}>
                {(action) => (
                  <div style={sectionStyles.row}>
                    <span style={sectionStyles.dim}>{action}</span>
                  </div>
                )}
              </For>
            </Expandable>
          </Show>
        </>
      )}
    </Show>
    </>
  );
}

/** The sub-view's own chrome: pinned under the tree, scrolling on its own. */
const detailStyles = {
  panel: {
    // Height is set by the drag handle above it; this only owns its scroll.
    overflow: 'auto',
    'min-height': 0
  },
  header: {
    display: 'flex',
    gap: '6px',
    'align-items': 'center',
    padding: '8px 0 6px',
    color: 'var(--wheel-stage-ink-faint, #8b8b8b)'
  },
  close: {
    'margin-left': 'auto',
    padding: '0 4px',
    border: 'none',
    background: 'none',
    color: 'var(--wheel-stage-ink-faint, #8b8b8b)',
    font: 'inherit',
    cursor: 'pointer'
  }
} satisfies Record<string, JSX.CSSProperties>;

/** The row's inspect toggle: quiet until it is on. */
const inspectStyle = {
  padding: 0,
  // Space before the name, so the eye reads as its own control rather than a
  // prefix on the label.
  'margin-right': '4px',
  'line-height': 1,
  border: 'none',
  background: 'none',
  font: 'inherit',
  cursor: 'pointer'
} satisfies JSX.CSSProperties;

function TreeNode(props: {
  node: InstanceTreeNode;
  services: ServiceContext;
  ex: ExpandState;
  selected: () => string | null;
  reveal: (instanceId: string) => void;
  inspected: () => string | null;
  inspect: (key: string | null) => void;
}): JSX.Element {
  const record = () => props.services.registry.instance(props.node.instanceId);
  // Live values, on the DATA channel. Kept out of the tree-shape memo so a
  // changing value updates a row instead of rebuilding every row.
  const liveProps = createMemo<Record<string, unknown>>(() => {
    props.services.trackVersion();
    return record()?.props() ?? {};
  });
  const liveState = createMemo<Record<string, unknown>>(() => {
    props.services.trackVersion();
    return record()?.state() ?? {};
  });
  const highlight = (id: string | null): void => props.services.get(InspectorService).highlight(id);
  /**
   * Why this component isn't on screen, if it isn't:
   *
   * - `hidden`  — a wheel `<Show>` at its root said no. Deliberate, and the
   *   thing you usually want to know (the todos demo's ClearCompletedButton
   *   disappears until something is completed).
   * - `no DOM`  — it renders nothing and nothing claims responsibility:
   *   either a headless component, plain Solid control flow wheel can't
   *   see, or a forgotten `use:componentRoot`.
   * - `null`    — it's on screen.
   */
  const invisibility = (): 'hidden' | 'no DOM' | null => {
    const instance = record();
    if (!instance) return null;
    for (const element of instance.elements) {
      if (element.isConnected) return null;
    }
    return instance.hiddenBy === 'show' ? 'hidden' : 'no DOM';
  };
  const inspecting = (): boolean => props.inspected() === props.node.key;
  // Only rows with children open. A caret on a leaf does nothing, and a tree
  // full of carets that do nothing is a tree you cannot skim.
  const expandable = (): boolean => props.node.children.length > 0;
  return (
    <div
      data-tree-node={props.node.instanceId}
      style={props.selected() === props.node.instanceId ? { background: 'var(--wheel-stage-hover, rgba(99,102,241,0.18))', 'border-radius': '4px' } : undefined}
    >
      <Expandable
        path={`tree:${props.node.key}`}
        label={props.node.instanceId}
        summary={invisibility() ? `⊘ ${invisibility()!}` : ''}
        accent={invisibility() ? 'var(--wheel-stage-ink-faint, #8b8b8b)' : undefined}
        ex={props.ex}
        expandable={expandable()}
        onRowEnter={() => highlight(props.node.instanceId)}
        onRowLeave={() => highlight(null)}
        leading={
          <button
            type="button"
            style={{
              ...inspectStyle,
              color: inspecting()
                ? 'var(--wheel-indigo-bright, #6366f1)'
                : 'var(--wheel-stage-ink-dim, #6b7280)'
            }}
            data-testid="wheel-tree-inspect"
            aria-pressed={inspecting()}
            title={`${inspecting() ? 'hide' : 'show'} props, state and actions`}
            onClick={() => props.inspect(inspecting() ? null : props.node.key)}
          >
            👁
          </button>
        }
        // The name asks "what is this holding", which is the same question the
        // eye asks. The caret stays the only thing that opens the children.
        onLabelClick={() => props.inspect(inspecting() ? null : props.node.key)}
      >
        <TreeChildren
          nodes={props.node.children}
          parentPath={`tree:${props.node.key}`}
          services={props.services}
          ex={props.ex}
          selected={props.selected}
          reveal={props.reveal}
          inspected={props.inspected}
          inspect={props.inspect}
        />
      </Expandable>
    </div>
  );
}

interface Buckets {
  readonly app: InstanceTreeNode[];
  readonly framework: InstanceTreeNode[];
}

function bucketize(registryTree: InstanceTreeNode[]): Buckets {
  const systems: InstanceTreeNode[] = [];
  const nested = extractSystems(prune(registryTree), systems);
  const roots = [...nested, ...systems];
  return {
    app: roots.filter((node) => node.group !== 'framework'),
    framework: roots.filter((node) => node.group === 'framework')
  };
}

/**
 * The rendered ancestor chain for one instance: containment ancestors,
 * minus system nodes (they render lifted to bucket level, so a system
 * target IS its own chain).
 */
function renderedChain(registry: DebugRegistry, instanceId: string): string[] {
  const target = registry.instance(instanceId);
  if (!target) return [];
  if (/System(#\d+)?$/.test(instanceId)) return [instanceId];
  const chain: string[] = [];
  let current: InstanceRecord | undefined = target;
  while (current) {
    if (!isChrome(current.instanceId) && !/System(#\d+)?$/.test(current.instanceId)) {
      chain.unshift(current.instanceId);
    }
    const parentId = registry.displayParentId(current);
    current = parentId ? registry.instance(parentId) : undefined;
  }
  return chain;
}

/**
 * The components pane's own layout: a tree that scrolls above a detail that
 * scrolls, split by a handle the reader can drag.
 *
 * The pane used to be one scrolling box with everything in it, so a big tree
 * pushed the detail off the bottom and the reader chased two things with one
 * scrollbar.
 *
 * The split is a `Frame.Column` of two `Frame.Row`s — the framework's own
 * geometry primitive, which brings the handle, the clamps and the remembered
 * size with it. The panel is a wheel app; it should not hand-roll a second,
 * worse copy of the thing it exists to show off.
 */
const treeStyles = {
  column: { display: 'flex', 'flex-direction': 'column', height: '100%', 'min-height': 0 },
  /** Frame sizes the region; this scrolls whatever does not fit in it. */
  region: { height: '100%', width: '100%', 'min-height': 0, overflow: 'auto' }
} satisfies Record<string, JSX.CSSProperties>;

/** The full mounted-component tree in App/Framework buckets, nodes default closed. */
export function ComponentTreeSection(props: { services: ServiceContext; ex: ExpandState }): JSX.Element {
  const registry = props.services.registry;
  // Shape rides the SHAPE channel: a mount, an unmount, a rename. Not
  // `trackDebug()`, which every service field write bumps — including the
  // inspector's `highlighted`, written by these very rows on hover. Sharing
  // that wire had the tree rebuilding itself under the pointer, detaching the
  // row mid-click and leaving the highlight on with no `mouseleave` to clear
  // it. Values stay live where they are read, inside the rows.
  const buckets = createMemo(() => {
    props.services.trackInstances();
    return bucketize(registry.instanceTree());
  });
  const [picking, setPicking] = createSignal(false);
  const [selected, setSelected] = createSignal<string | null>(null);
  // The component whose data the sub-view is showing, by durable key. One at
  // a time on purpose: this is "what is this component holding", not a second
  // tree to navigate.
  const [inspected, setInspected] = createSignal<string | null>(null);
  const inspectedNode = createMemo<InstanceTreeNode | null>(() => {
    const key = inspected();
    if (key === null) return null;
    const find = (nodes: readonly InstanceTreeNode[]): InstanceTreeNode | null => {
      for (const node of nodes) {
        if (node.key === key) return node;
        const found = find(node.children);
        if (found) return found;
      }
      return null;
    };
    return find([...buckets().app, ...buckets().framework]);
  });
  const highlight = (id: string | null): void => props.services.get(InspectorService).highlight(id);

  const reveal = (instanceId: string): void => {
    const chain = renderedChain(registry, instanceId);
    if (chain.length === 0) return;
    const rootRecord = registry.instance(chain[0]);
    const bucket = rootRecord?.group === 'framework' ? 'framework' : 'app';
    // Bucket first (App is default-open, Framework default-closed), then
    // every ancestor, then the target itself so its state is showing.
    props.ex.expand(`ctree:${bucket}`, bucket === 'app');
    // Each step may sit inside a collapsed same-name LIST group; opening the
    // ancestor alone would leave the target hidden behind `TodoRow[]`.
    let parentPath = `ctree:${bucket}`;
    for (const id of chain) {
      const record = registry.instance(id);
      if (record) props.ex.expand(`${parentPath}:list:${record.name}`);
      // Paths are keyed on the DURABLE key, never the display id — see
      // `InstanceTreeNode.key`. Expanding `tree:<instanceId>` here would open
      // a path no row is ever rendered under the moment a name repeats.
      const path = `tree:${record?.key ?? id}`;
      props.ex.expand(path);
      parentPath = path;
    }
    setSelected(instanceId);
    // Picking a component from the app asks "what is this thing", so the
    // sub-view opens with it rather than making you press one more control.
    const picked = registry.instance(instanceId);
    if (picked) setInspected(picked.key);
    // Scroll after the expansion has rendered. `start` puts the node's TOP
    // at the top of the pane — what you want when the node has just been
    // expanded and its contents run below it. `scroll-margin-top` keeps it
    // clear of the pane's sticky heading, which would otherwise cover it.
    requestAnimationFrame(() => {
      const node = document.querySelector<HTMLElement>(`[data-tree-node="${CSS.escape(instanceId)}"]`);
      if (!node) return;
      node.style.scrollMarginTop = '26px';
      node.scrollIntoView({ block: 'start' });
    });
  };

  // listener boundary: while the picker is active, Escape cancels it. The
  // pointer work rides the overlay below, not the document — see there for
  // why.
  createEffect(() => {
    if (!picking()) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setPicking(false);
        highlight(null);
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    onCleanup(() => document.removeEventListener('keydown', onKeyDown, true));
  });

  /**
   * What the cursor is over, with the overlay itself taken out of the way.
   * `elementFromPoint` returns the topmost element, which IS the overlay —
   * so it goes pointer-transparent for the duration of the hit test and
   * comes straight back. Synchronous, so nothing renders in between.
   */
  const instanceUnder = (x: number, y: number, overlay: HTMLElement): InstanceRecord | undefined => {
    const previous = overlay.style.pointerEvents;
    overlay.style.pointerEvents = 'none';
    const element = document.elementFromPoint(x, y);
    overlay.style.pointerEvents = previous;
    return element ? registry.instanceAt(element) : undefined;
  };

  const empty = (): boolean => buckets().app.length === 0 && buckets().framework.length === 0;
  return (
    <div style={treeStyles.column}>
      {/*
        The picker's click shield. A capture-phase document listener was not
        enough: it only intercepts `click`, so the app still received
        pointerdown/mousedown first — and plenty of UI acts on those (the
        sheet demo begins editing a cell on mousedown). A real overlay means
        the app receives NOTHING while picking.

        Its z-index sits below the dock's (`DOCK_LAYER` in wheel-app), so the
        panel stays clickable and the tree can be scrolled while picking.
      */}
      <Show when={picking()}>
        <Portal>
          <div
            style={{
              position: 'fixed',
              inset: '0',
              'z-index': 9400,
              cursor: 'crosshair',
              // Raw rgba on purpose: the picker's click shield covers the whole
              // app and must stay all-but-invisible.
              // wheel-color: any opaque token here would black out the page you are picking from
              background: 'rgba(99,102,241,0.04)'
            }}
            data-testid="wheel-picker-overlay"
            onPointerMove={(event) =>
              highlight(
                instanceUnder(event.clientX, event.clientY, event.currentTarget)?.instanceId ?? null
              )
            }
            onPointerDown={(event) => {
              // Swallow the press itself; the app must not see it at all.
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const record = instanceUnder(event.clientX, event.clientY, event.currentTarget);
              setPicking(false);
              highlight(null);
              if (record) reveal(record.instanceId);
            }}
          />
        </Portal>
      </Show>
      <div style={{ ...sectionStyles.paneTitle, display: 'flex', gap: '8px', 'align-items': 'center' }}>
        <span>components</span>
        <button
          type="button"
          style={{
            padding: '0 6px',
            color: picking() ? 'var(--wheel-indigo-bright, #6366f1)' : 'var(--wheel-stage-ink-faint, #8b8b8b)',
            background: picking() ? 'var(--wheel-stage-hover, rgba(99,102,241,0.15))' : 'none',
            border: '1px solid var(--wheel-stage-line-heavy, #3a3b3e)',
            'border-radius': '5px',
            cursor: 'pointer',
            font: 'inherit',
            'text-transform': 'none'
          }}
          onClick={() => setPicking(!picking())}
          data-testid="wheel-tree-pick"
          aria-label="pick a component: hover to highlight, click to reveal it in the tree"
          title="pick a component on the page (Escape cancels)"
        >
          ⌖
        </button>
      </div>
      <Frame.Column id="wheel-debug-components" size="1fr" class={undefined}>
      <Frame.Row
        id="wheel-debug-tree"
        // The handle belongs to the region above the boundary, and it resizes
        // THAT region — so the tree carries the size and the detail absorbs
        // what is left. With no detail open there is nothing to absorb, so
        // the tree takes the pane.
        size={inspectedNode() ? '240px' : '1fr'}
        minSize="80px"
      >
      <div style={treeStyles.region} data-testid="wheel-tree-scroll">
      <Show
        when={!empty()}
        fallback={<div style={sectionStyles.dim}>nothing mounted (components register via connect() and use:viewRoot)</div>}
      >
        <Show when={buckets().app.length > 0}>
          <Expandable path="ctree:app" label="App" summary={`(${buckets().app.length})`} defaultOpen ex={props.ex}>
            <TreeChildren
              nodes={buckets().app}
              parentPath="ctree:app"
              services={props.services}
              ex={props.ex}
              selected={selected}
              reveal={reveal}
              inspected={inspected}
              inspect={setInspected}
            />
          </Expandable>
        </Show>
        <Show when={buckets().framework.length > 0}>
          <Expandable
            path="ctree:framework"
            label="Framework"
            summary={`(${buckets().framework.length})`}
            ex={props.ex}
          >
            <TreeChildren
              nodes={buckets().framework}
              parentPath="ctree:framework"
              services={props.services}
              ex={props.ex}
              selected={selected}
              reveal={reveal}
              inspected={inspected}
              inspect={setInspected}
            />
          </Expandable>
        </Show>
      </Show>
      </div>
      </Frame.Row>
      {/* The sub-view, attached under the tree. `Frame.Row` brings the handle,
          the clamps and the remembered height. */}
      <Show when={inspectedNode()}>
        {(node) => (
          <Frame.Row id="wheel-debug-detail" size="1fr" minSize="60px">
            <div style={treeStyles.region} data-testid="wheel-tree-detail">
              <ComponentDetail
                node={node()}
                services={props.services}
                ex={props.ex}
                reveal={reveal}
                close={() => setInspected(null)}
              />
            </div>
          </Frame.Row>
        )}
      </Show>
      </Frame.Column>
    </div>
  );
}
