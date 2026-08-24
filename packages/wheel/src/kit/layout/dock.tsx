import { For, onCleanup, Show, type JSX } from 'solid-js';

import { viewRoot } from '../../core/connect';
import { useSignal } from '../../core/local-state';

import { createGesture } from './gesture-dom';
import { FrameColumn, FrameRow } from './frame';
import type { DockEdge, DockIntent, SplitTree } from './split-tree';

/** Drag wiring handed to the panel render prop; attach `grip` to the drag affordance. */
export interface FrameDockPanelDrag {
  /** Ref for the element that starts this panel's dock drag. */
  readonly grip: (element: HTMLElement) => void;
  /** True while this panel is being dragged. */
  readonly dragging: () => boolean;
}

/** One leaf handed to the panel render prop. */
export interface FrameDockLeaf {
  readonly panelId: string;
}

/** Props for the opt-in free-form docking surface. */
export interface FrameDockProps {
  /** The app-owned workspace tree; plain JSON in an application atom. */
  readonly tree: SplitTree;
  /** A completed drop; apply it with `applyDockIntent` in an app action. */
  readonly onIntent: (intent: DockIntent) => void;
  /** Renders one panel's content; ids become components here, nowhere else. */
  readonly panel: (leaf: FrameDockLeaf, drag: FrameDockPanelDrag) => JSX.Element;
  readonly class?: string;
  readonly style?: JSX.CSSProperties;
}

interface DockDragState {
  readonly panelId: string;
  readonly target: {
    readonly panelId: string;
    readonly edge: DockEdge;
    readonly rect: DOMRect;
  } | null;
}

/** The dock edge a pointer position selects inside a leaf rectangle. */
export function dockEdgeAt(rect: DOMRect, x: number, y: number): DockEdge {
  const fx = rect.width > 0 ? (x - rect.left) / rect.width : 0.5;
  const fy = rect.height > 0 ? (y - rect.top) / rect.height : 0.5;
  const distances: readonly [DockEdge, number][] = [
    ['left', fx],
    ['right', 1 - fx],
    ['top', fy],
    ['bottom', 1 - fy]
  ];
  return distances.reduce((best, entry) => (entry[1] < best[1] ? entry : best))[0];
}

/**
 * Render an app-owned split tree and run its dock-drop interaction.
 *
 * `Frame.Dock` never mutates the tree: a completed drop surfaces as a
 * `DockIntent` for an application action to apply. Leaves render through the
 * `panel` render prop, splits render as ordinary `Frame.Row`/`Frame.Column`
 * frames, so resizing, persistence, and observability work unchanged.
 */
export function FrameDock(props: FrameDockProps): JSX.Element {
  const [drag, setDrag] = useSignal<DockDragState | null>(null, 'drag');
  const leaves = new Map<string, HTMLElement>();
  let root: HTMLDivElement | undefined;

  const hitTest = (x: number, y: number, draggedId: string): DockDragState => {
    for (const [panelId, element] of leaves) {
      if (panelId === draggedId) continue;
      const rect = element.getBoundingClientRect();
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
        continue;
      }
      return {
        panelId: draggedId,
        target: { panelId, edge: dockEdgeAt(rect, x, y), rect }
      };
    }
    return { panelId: draggedId, target: null };
  };

  const previewStyle = (): JSX.CSSProperties => {
    const state = drag();
    if (!state?.target || !root) return { display: 'none' };
    const rootRect = root.getBoundingClientRect();
    const { rect, edge } = state.target;
    const half = {
      left: { width: rect.width / 2, height: rect.height, dx: 0, dy: 0 },
      right: {
        width: rect.width / 2,
        height: rect.height,
        dx: rect.width / 2,
        dy: 0
      },
      top: { width: rect.width, height: rect.height / 2, dx: 0, dy: 0 },
      bottom: {
        width: rect.width,
        height: rect.height / 2,
        dx: 0,
        dy: rect.height / 2
      }
    }[edge];
    return {
      position: 'absolute',
      left: `${rect.left - rootRect.left + half.dx}px`,
      top: `${rect.top - rootRect.top + half.dy}px`,
      width: `${half.width}px`,
      height: `${half.height}px`,
      background: 'var(--wheel-dock-preview, rgba(90, 120, 255, 0.25))',
      border: '1px solid var(--wheel-dock-preview-border, rgba(90, 120, 255, 0.9))',
      'pointer-events': 'none',
      'z-index': 50
    };
  };

  const leaf = (node: Extract<SplitTree, { kind: 'panel' }>): JSX.Element => {
    const register = (element: HTMLElement): void => {
      leaves.set(node.panelId, element);
      onCleanup(() => leaves.delete(node.panelId));
    };
    const grip = (element: HTMLElement): void => {
      const gesture = createGesture(element, {
        onDraft: (delta) => setDrag(hitTest(delta.x, delta.y, node.panelId)),
        onCommit: () => {
          const state = drag();
          setDrag(null);
          if (state?.target) {
            props.onIntent({
              panelId: state.panelId,
              targetPanelId: state.target.panelId,
              edge: state.target.edge
            });
          }
        },
        onCancel: () => setDrag(null)
      });
      onCleanup(() => gesture.dispose());
    };
    const dragging = (): boolean => drag()?.panelId === node.panelId;
    return (
      <FrameColumn id={node.id} size="1fr" minSize="60px">
        <div
          ref={register}
          data-wheel-dock-panel={node.panelId}
          data-dragging={dragging() ? 'true' : undefined}
          style={{ display: 'flex', flex: '1 1 auto', 'min-width': '0', 'min-height': '0' }}
        >
          {props.panel({ panelId: node.panelId }, { grip, dragging })}
        </div>
      </FrameColumn>
    );
  };

  const renderNode = (node: SplitTree): JSX.Element => {
    if (node.kind === 'panel') return leaf(node);
    return node.axis === 'row' ? (
      <FrameRow id={node.id} size="1fr">
        <For each={node.children}>{renderNode}</For>
      </FrameRow>
    ) : (
      <FrameColumn id={node.id} size="1fr">
        <For each={node.children}>{renderNode}</For>
      </FrameColumn>
    );
  };

  return (
    <div
      use:viewRoot={{ name: 'FrameDock', group: 'framework', props }}
      ref={root}
      class={props.class}
      data-wheel-dock=""
      style={{
        position: 'relative',
        display: 'flex',
        flex: '1 1 auto',
        'min-width': '0',
        'min-height': '0',
        ...props.style
      }}
    >
      <Show when={props.tree} keyed>
        {(tree) => renderNode(tree)}
      </Show>
      <div style={previewStyle()} />
    </div>
  );
}
