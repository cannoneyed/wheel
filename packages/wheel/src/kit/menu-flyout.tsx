/**
 * The flyout menu — the same `MenuStack` data, drawn as side-by-side panels.
 *
 * `MenuStackPanel` draws the stack IN PLACE: choosing a group redraws the
 * one panel with a back control. That suits touch and narrow screens. On a
 * desktop with a mouse, people expect the submenu to open BESIDE its row on
 * hover, and to stay open while the pointer travels into it. This renderer
 * draws every open level of the same stack as its own panel, each one
 * placed next to the row that opened it (floating-ui `flip` moves it to the
 * left edge when the right has no room).
 *
 * The stack stays the one source of truth: which levels are open, and the
 * highlight. Keys go through the caller, which calls the same stack
 * methods the stacked renderer uses, so both answer the same keys.
 *
 * Hover intent has two parts:
 *
 * - Opening waits `OPEN_DELAY_MS`, so sweeping the pointer down a menu does
 *   not flash every submenu it passes.
 * - Closing waits while the pointer moves inside the "safe triangle" from
 *   where it was toward the open child panel. Without it, a diagonal move
 *   from a row into its submenu crosses the row below and closes the
 *   submenu before the pointer arrives.
 *
 * Timers come from the caller's `schedule` (the service clock), never from
 * `setTimeout`, so tests step time.
 */
import { For, createEffect, onCleanup, type JSX } from 'solid-js';
import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom';

import { viewRoot } from '../core/connect';
import { MenuStackPanel } from './menu-stack-panel';
import type { MenuItem, MenuStack, MenuStackState } from './menu-stack';

// Solid compiles `use:` directives away unless the name is referenced.
void viewRoot;

/** How long the pointer rests on a group before its submenu opens. */
export const OPEN_DELAY_MS = 150;

/** How long a move toward an open submenu keeps it open. */
export const SAFE_TRIANGLE_MS = 300;

/** A point in viewport pixels. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * Whether `point` lies inside the triangle `a`, `b`, `c` (edges count).
 * The flyout's safe triangle: `a` is where the pointer was, `b` and `c` are
 * the near corners of the open submenu.
 */
export function insideTriangle(point: Point, a: Point, b: Point, c: Point): boolean {
  const side = (p: Point, q: Point, r: Point) => (p.x - r.x) * (q.y - r.y) - (q.x - r.x) * (p.y - r.y);
  const d1 = side(point, a, b);
  const d2 = side(point, b, c);
  const d3 = side(point, c, a);
  const negative = d1 < 0 || d2 < 0 || d3 < 0;
  const positive = d1 > 0 || d2 > 0 || d3 > 0;
  return !(negative && positive);
}

/** What the flyout needs to draw one stack. */
export interface MenuFlyoutProps {
  /** The stack to draw. */
  readonly stack: MenuStack;
  /** Read the state (the caller wraps the stack in a signal). */
  readonly state: () => MenuStackState;
  /** Called when an entry RAN — the caller closes the menu. */
  readonly onRun?: () => void;
  /** One-shot timer from the service clock. Returns the cancel function. */
  readonly schedule: (ms: number, fn: () => void) => () => void;
  /** Render a caller-defined icon key. */
  readonly renderIcon?: (icon: string) => JSX.Element;
}

/** Pop levels until `depth` is on top. Returns whether anything popped. */
function truncate(stack: MenuStack, depth: number): boolean {
  let popped = false;
  while (stack.state().stack.length - 1 > depth) {
    stack.pop();
    popped = true;
  }
  return popped;
}

/** The flyout renderer (see module doc). */
export function MenuFlyout(props: MenuFlyoutProps): JSX.Element {
  const panels: HTMLDivElement[] = [];
  let lastPointer: Point | null = null;
  let cancelPending: (() => void) | null = null;
  const cancel = () => {
    cancelPending?.();
    cancelPending = null;
  };
  onCleanup(cancel);

  const depthOf = () => props.state().stack.length - 1;

  /** The state one level's panel draws: its own items and highlight. */
  const levelState = (depth: number) => (): MenuStackState => {
    const state = props.state();
    const level = state.stack[depth];
    const top = depth === state.stack.length - 1;
    return {
      ...state,
      stack: state.stack.slice(0, depth + 1),
      query: '',
      items: level ? [...level.items] : [],
      title: null,
      grid: null,
      gridPoint: { rows: 0, columns: 0 },
      input: null,
      index: top ? state.index : (state.trail[depth] ?? -1),
      trail: state.trail.slice(0, depth)
    };
  };

  /** Open `item`'s submenu from `depth`, now. */
  const openFrom = (depth: number, index: number) => {
    truncate(props.stack, depth);
    props.stack.highlight(index);
    const item = props.stack.state().items[index];
    if (item?.submenu && item.disabled !== true) props.stack.choose(item);
  };

  /** Hovering row `index` at `depth`. */
  const hover = (depth: number, index: number) => {
    const state = props.state();
    // Already the open group at this depth: nothing to do.
    if (depth < depthOf() && state.trail[depth] === index) {
      cancel();
      return;
    }
    const child = panels[depth + 1];
    if (depth < depthOf() && child && lastPointer && movingToward(child)) {
      // Heading for the open submenu: wait, and switch only if the pointer
      // stops short of it.
      cancel();
      cancelPending = props.schedule(SAFE_TRIANGLE_MS, () => {
        cancelPending = null;
        hoverNow(depth, index);
      });
      return;
    }
    hoverNow(depth, index);
  };

  const hoverNow = (depth: number, index: number) => {
    cancel();
    truncate(props.stack, depth);
    props.stack.highlight(index);
    const item: MenuItem | undefined = props.stack.state().items[index];
    if (item?.submenu && item.disabled !== true) {
      cancelPending = props.schedule(OPEN_DELAY_MS, () => {
        cancelPending = null;
        openFrom(depth, index);
      });
    }
  };

  let previousPointer: Point | null = null;
  const movingToward = (child: HTMLElement): boolean => {
    if (!previousPointer || !lastPointer) return false;
    const rect = child.getBoundingClientRect();
    // The near edge: the child's left edge when it opened to the right.
    const nearX = rect.left >= previousPointer.x ? rect.left : rect.right;
    return insideTriangle(lastPointer, previousPointer, { x: nearX, y: rect.top }, { x: nearX, y: rect.bottom });
  };

  // dom boundary: place each submenu panel beside the row that opened it.
  // floating-ui flips it to the left when the right edge has no room, and
  // autoUpdate follows scroll and resize while it is open.
  createEffect(() => {
    const state = props.state();
    for (let depth = 1; depth < state.stack.length; depth += 1) {
      const panel = panels[depth];
      const parent = panels[depth - 1];
      const opener = parent?.querySelectorAll<HTMLElement>('[data-testid^="wheel-menu-item-"]')[state.trail[depth - 1] ?? -1];
      if (!panel || !opener) continue;
      const place = () =>
        void computePosition(opener, panel, {
          placement: 'right-start',
          strategy: 'fixed',
          middleware: [offset({ mainAxis: 2, crossAxis: -5 }), flip({ fallbackPlacements: ['left-start'] }), shift({ padding: 8 })]
        }).then(({ x, y }) => {
          panel.style.left = `${x}px`;
          panel.style.top = `${y}px`;
        });
      onCleanup(autoUpdate(opener, panel, place));
    }
  });

  return (
    <div
      use:viewRoot={{ name: 'MenuFlyout', group: 'framework', props }}
      data-testid="wheel-menu-flyout"
      onPointerMove={(event) => {
        previousPointer = lastPointer;
        lastPointer = { x: event.clientX, y: event.clientY };
      }}
    >
      <For each={props.state().stack}>
        {(_, depth) => {
          const state = levelState(depth());
          const levelStack: MenuStack = {
            ...props.stack,
            state,
            highlight: (index) => hover(depth(), index),
            choose: (item) => {
              cancel();
              truncate(props.stack, depth());
              const index = item ? props.stack.state().items.indexOf(item) : -1;
              if (index >= 0) props.stack.highlight(index);
              return props.stack.choose(item);
            },
            pop: () => false
          };
          return (
            <div
              ref={(element) => {
                panels[depth()] = element;
              }}
              role="presentation"
              data-testid={`wheel-menu-level-${depth()}`}
              data-level={depth()}
              style={
                depth() === 0
                  ? undefined
                  : { position: 'fixed', top: '0', left: '0', 'z-index': 10_002 + depth() }
              }
              onPointerEnter={() => {
                // Arriving in a submenu keeps it: drop any pending switch.
                if (depth() > 0) cancel();
              }}
            >
              <MenuStackPanel stack={levelStack} state={state} onRun={props.onRun} renderIcon={props.renderIcon} />
            </div>
          );
        }}
      </For>
    </div>
  );
}
