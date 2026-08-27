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
}): JSX.Element {
  return (
    <For each={groupSiblings(props.nodes)}>
      {(child) =>
        child.kind === 'node' ? (
          <TreeNode node={child.node} services={props.services} ex={props.ex} selected={props.selected} />
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
                <TreeNode node={member} services={props.services} ex={props.ex} selected={props.selected} />
              )}
            </For>
          </Expandable>
        )
      }
    </For>
  );
}

function TreeNode(props: {
  node: InstanceTreeNode;
  services: ServiceContext;
  ex: ExpandState;
  selected: () => string | null;
}): JSX.Element {
  const record = () => props.services.registry.instance(props.node.instanceId);
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
  const summary = (): string => {
    const count = props.node.children.length;
    const kind = props.node.kind === 'view' ? 'view' : '';
    return [kind, count > 0 ? `(${count})` : ''].filter(Boolean).join(' ');
  };
  return (
    <div
      data-tree-node={props.node.instanceId}
      style={props.selected() === props.node.instanceId ? { background: 'var(--wheel-stage-hover, rgba(99,102,241,0.18))', 'border-radius': '4px' } : undefined}
    >
      <Expandable
        path={`tree:${props.node.key}`}
        label={props.node.instanceId}
        summary={[summary(), invisibility() ? `⊘ ${invisibility()!}` : ''].filter(Boolean).join(' ')}
        accent={invisibility() ? 'var(--wheel-stage-ink-faint, #8b8b8b)' : undefined}
        ex={props.ex}
        onRowEnter={() => highlight(props.node.instanceId)}
        onRowLeave={() => highlight(null)}
      >
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
              <Show when={Object.keys(instanceRecord().props()).length > 0}>
                <Expandable
                  path={`tree:${props.node.key}:props`}
                  label="props"
                  summary={`{${Object.keys(instanceRecord().props()).length}}`}
                  accent={META_COLORS.props}
                  icon="▪"
                  defaultOpen
                  ex={props.ex}
                >
                  <For each={Object.entries(instanceRecord().props())}>
                    {([key, value]) => (
                      <JsonTree
                        path={`tree:${props.node.key}:props.${key}`}
                        label={key}
                        value={value}
                        ex={props.ex}
                      />
                    )}
                  </For>
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
              <Show when={Object.keys(instanceRecord().state()).length > 0}>
                <Expandable
                  path={`tree:${props.node.key}:connected`}
                  label="connected"
                  summary={`{${Object.keys(instanceRecord().state()).length}}`}
                  accent={META_COLORS.connected}
                  icon="◆"
                  defaultOpen
                  ex={props.ex}
                >
                  <For each={Object.entries(instanceRecord().state())}>
                    {([key, value]) => (
                      <JsonTree
                        path={`tree:${props.node.key}.${key}`}
                        label={key}
                        value={value}
                        ex={props.ex}
                      />
                    )}
                  </For>
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
        <TreeChildren
          nodes={props.node.children}
          parentPath={`tree:${props.node.key}`}
          services={props.services}
          ex={props.ex}
          selected={props.selected}
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

/** The full mounted-component tree in App/Framework buckets, nodes default closed. */
export function ComponentTreeSection(props: { services: ServiceContext; ex: ExpandState }): JSX.Element {
  const registry = props.services.registry;
  const buckets = createMemo(() => {
    // Tree SHAPE rides the instance channel; live state values ride the data
    // revision (JsonTree re-reads on expansion via the memo below).
    props.services.trackDebug();
    props.services.trackVersion();
    return bucketize(registry.instanceTree());
  });
  const [picking, setPicking] = createSignal(false);
  const [selected, setSelected] = createSignal<string | null>(null);
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
    <>
      {/*
        The picker's click shield. A capture-phase document listener was not
        enough: it only intercepts `click`, so the app still received
        pointerdown/mousedown first — and plenty of UI acts on those (the
        sheet demo begins editing a cell on mousedown). A real overlay means
        the app receives NOTHING while picking.

        Its z-index sits below the dock (9500), so the debug panel stays
        clickable and the tree can be scrolled while the picker is armed.
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
            />
          </Expandable>
        </Show>
      </Show>
    </>
  );
}
