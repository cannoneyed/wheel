import type { FrameAxis } from './model';

/**
 * The app-owned workspace tree behind `Frame.Dock`. Plain JSON: it lives in
 * an application atom, persists with application persistence, and stores
 * only ids — components come from the app's render prop, never from here.
 */
export type SplitTree =
  | {
      readonly kind: 'split';
      readonly id: string;
      readonly axis: FrameAxis;
      readonly children: readonly SplitTree[];
    }
  | {
      readonly kind: 'panel';
      readonly id: string;
      readonly panelId: string;
    };

/** Which side of the target panel a dropped panel lands on. */
export type DockEdge = 'left' | 'right' | 'top' | 'bottom';

/** A completed dock drop, reported by `Frame.Dock` and applied by an app action. */
export interface DockIntent {
  /** The dragged panel. */
  readonly panelId: string;
  /** The panel whose edge received the drop. */
  readonly targetPanelId: string;
  readonly edge: DockEdge;
}

/** Every panelId in the tree, in depth-first order. */
export function panelIds(tree: SplitTree): readonly string[] {
  if (tree.kind === 'panel') return [tree.panelId];
  return tree.children.flatMap(panelIds);
}

/**
 * Apply one dock drop: detach the dragged panel, land it on the target
 * panel's edge, and normalize. Same-axis drops insert a sibling; cross-axis
 * drops wrap the target in a new split. Untouched branches keep their
 * object identity so renderers can preserve their DOM. Impossible intents
 * (unknown ids, self-drops) return the tree unchanged.
 */
export function applyDockIntent(tree: SplitTree, intent: DockIntent): SplitTree {
  if (intent.panelId === intent.targetPanelId) return tree;
  const ids = panelIds(tree);
  if (!ids.includes(intent.panelId) || !ids.includes(intent.targetPanelId)) {
    return tree;
  }
  const detached = detachPanel(tree, intent.panelId);
  if (!detached.tree || !detached.panel) return tree;
  const nextId = nextSplitOrdinal(tree);
  const landed = landPanel(detached.tree, detached.panel, intent, () => {
    const id = `split-${nextId.value}`;
    nextId.value += 1;
    return id;
  });
  return normalizeSplitTree(landed) ?? tree;
}

/** Remove one panel; null when the tree becomes empty. */
export function removePanel(tree: SplitTree, panelId: string): SplitTree | null {
  const detached = detachPanel(tree, panelId);
  if (!detached.panel) return tree;
  return detached.tree ? normalizeSplitTree(detached.tree) : null;
}

/**
 * Collapse single-child splits, drop empty splits, and merge a split into a
 * same-axis parent. Returns null for an empty tree; returns the input
 * reference when nothing changed.
 */
export function normalizeSplitTree(tree: SplitTree): SplitTree | null {
  if (tree.kind === 'panel') return tree;
  const children: SplitTree[] = [];
  let changed = false;
  for (const child of tree.children) {
    const normalized = normalizeSplitTree(child);
    if (!normalized) {
      changed = true;
      continue;
    }
    if (normalized !== child) changed = true;
    if (normalized.kind === 'split' && normalized.axis === tree.axis) {
      children.push(...normalized.children);
      changed = true;
      continue;
    }
    children.push(normalized);
  }
  if (children.length === 0) return null;
  if (children.length === 1) return children[0]!;
  return changed ? { ...tree, children } : tree;
}

interface DetachResult {
  readonly tree: SplitTree | null;
  readonly panel: Extract<SplitTree, { kind: 'panel' }> | null;
}

function detachPanel(tree: SplitTree, panelId: string): DetachResult {
  if (tree.kind === 'panel') {
    return tree.panelId === panelId
      ? { tree: null, panel: tree }
      : { tree, panel: null };
  }
  let panel: DetachResult['panel'] = null;
  let changed = false;
  const children: SplitTree[] = [];
  for (const child of tree.children) {
    if (panel) {
      children.push(child);
      continue;
    }
    const result = detachPanel(child, panelId);
    if (result.panel) {
      panel = result.panel;
      changed = true;
      if (result.tree) children.push(result.tree);
      continue;
    }
    children.push(child);
  }
  if (!changed) return { tree, panel: null };
  if (children.length === 0) return { tree: null, panel };
  return { tree: { ...tree, children }, panel };
}

function landPanel(
  tree: SplitTree,
  panel: Extract<SplitTree, { kind: 'panel' }>,
  intent: DockIntent,
  allocateSplitId: () => string
): SplitTree {
  const axis: FrameAxis =
    intent.edge === 'left' || intent.edge === 'right' ? 'row' : 'column';
  const before = intent.edge === 'left' || intent.edge === 'top';

  const visit = (node: SplitTree): SplitTree => {
    if (node.kind === 'panel') {
      if (node.panelId !== intent.targetPanelId) return node;
      const pair = before ? [panel, node] : [node, panel];
      return { kind: 'split', id: allocateSplitId(), axis, children: pair };
    }
    if (node.axis === axis) {
      const index = node.children.findIndex(
        (child) => child.kind === 'panel' && child.panelId === intent.targetPanelId
      );
      if (index !== -1) {
        const children = [...node.children];
        children.splice(before ? index : index + 1, 0, panel);
        return { ...node, children };
      }
    }
    let changed = false;
    const children = node.children.map((child) => {
      const next = visit(child);
      if (next !== child) changed = true;
      return next;
    });
    return changed ? { ...node, children } : node;
  };

  return visit(tree);
}

function nextSplitOrdinal(tree: SplitTree): { value: number } {
  let max = 0;
  const visit = (node: SplitTree): void => {
    const match = /^split-(\d+)$/.exec(node.id);
    if (match) max = Math.max(max, Number(match[1]));
    if (node.kind === 'split') node.children.forEach(visit);
  };
  visit(tree);
  return { value: max + 1 };
}
