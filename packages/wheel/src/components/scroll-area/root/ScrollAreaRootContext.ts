/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext, type Accessor, type Setter } from 'solid-js';
import type { Coords, HiddenState, OverflowEdges, Size, ScrollAreaRootState } from './ScrollAreaRoot';

/**
 * Solid port of upstream's `scroll-area/root/ScrollAreaRootContext.ts`.
 *
 * Context values carry accessors/setters rather than snapshots so descendants read live state
 * (see CONVENTIONS.md). Mutable DOM node references use the plain `{ current }` box pattern
 * used throughout this port (see `slider/root/SliderRootContext.ts`).
 */
export interface ScrollAreaRootContextValue {
  cornerSize: Accessor<Size>;
  setCornerSize: Setter<Size>;
  thumbSize: Accessor<Size>;
  setThumbSize: Setter<Size>;
  hasMeasuredScrollbar: Accessor<boolean>;
  setHasMeasuredScrollbar: Setter<boolean>;
  touchModality: Accessor<boolean>;
  hovering: Accessor<boolean>;
  setHovering: Setter<boolean>;
  scrollingX: Accessor<boolean>;
  setScrollingX: Setter<boolean>;
  scrollingY: Accessor<boolean>;
  setScrollingY: Setter<boolean>;
  viewportRef: { current: HTMLElement | null };
  rootRef: { current: HTMLElement | null };
  scrollbarYRef: { current: HTMLElement | null };
  thumbYRef: { current: HTMLElement | null };
  scrollbarXRef: { current: HTMLElement | null };
  thumbXRef: { current: HTMLElement | null };
  cornerRef: { current: HTMLElement | null };
  handlePointerDown: (event: PointerEvent) => void;
  handlePointerMove: (event: PointerEvent) => void;
  handlePointerUp: (event: PointerEvent) => void;
  handleScroll: (scrollPosition: Coords) => void;
  rootId: Accessor<string | undefined>;
  hiddenState: Accessor<HiddenState>;
  setHiddenState: Setter<HiddenState>;
  overflowEdges: Accessor<OverflowEdges>;
  setOverflowEdges: Setter<OverflowEdges>;
  /**
   * The shared `ScrollAreaRootState` getters object, reused as-is by `Viewport` and `Content`
   * (matching upstream, where `ScrollAreaContent` reads `viewportState` straight from context
   * instead of recomputing it).
   */
  viewportState: ScrollAreaRootState;
  overflowEdgeThreshold: Accessor<{
    xStart: number;
    xEnd: number;
    yStart: number;
    yEnd: number;
  }>;
}

export const ScrollAreaRootContext = createContext<ScrollAreaRootContextValue | undefined>(
  undefined,
);

export function useScrollAreaRootContext(): ScrollAreaRootContextValue {
  const context = useContext(ScrollAreaRootContext);
  if (context === undefined) {
    throw new Error(
      'Base UI: ScrollAreaRootContext is missing. ScrollArea parts must be placed within <ScrollArea.Root>.',
    );
  }
  return context;
}
