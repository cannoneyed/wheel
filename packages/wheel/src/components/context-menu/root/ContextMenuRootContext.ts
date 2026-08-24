/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext, type Accessor } from 'solid-js';

/**
 * A virtual anchor: something that has a `getBoundingClientRect` but isn't necessarily a real DOM
 * element. Used to position the menu at the pointer/touch coordinates instead of a trigger element.
 */
export interface ContextMenuAnchor {
  getBoundingClientRect(): DOMRect;
}

export interface ContextMenuRootContextValue {
  /**
   * The current virtual anchor, positioned at the point the context menu was opened from.
   */
  anchor: Accessor<ContextMenuAnchor>;
  setAnchor: (anchor: ContextMenuAnchor) => void;
  /**
   * The rendered `Menu.Backdrop` element, if any. Read by `ContextMenu.Trigger` so a right click on
   * the backdrop while the menu is open is also suppressed from opening the native context menu.
   */
  backdropRef: { current: HTMLElement | null };
  /**
   * The internal (non-user-rendered) backdrop element `Menu.Positioner` renders for modal popups.
   */
  internalBackdropRef: { current: HTMLElement | null };
  /**
   * The rendered `Menu.Positioner` element. Read by `ContextMenu.Trigger`'s document-level `mouseup`
   * listener so a release inside the menu itself never cancels the just-opened menu.
   */
  positionerRef: { current: HTMLElement | null };
  /**
   * The client point the context menu was opened from. Consulted (and cleared) by menu items so a
   * `mouseup` landing exactly where the menu spawned (the same physical click/long-press that opened
   * it) doesn't also activate whichever item happens to render under the cursor.
   */
  initialCursorPointRef: { current: { x: number; y: number } | null };
}

export const ContextMenuRootContext = createContext<ContextMenuRootContextValue | undefined>(
  undefined,
);

export function useContextMenuRootContext(optional: false): ContextMenuRootContextValue;
export function useContextMenuRootContext(optional?: true): ContextMenuRootContextValue | undefined;
export function useContextMenuRootContext(optional = true) {
  const context = useContext(ContextMenuRootContext);
  if (context === undefined && !optional) {
    throw new Error(
      'Base UI: ContextMenuRootContext is missing. ContextMenu parts must be placed within <ContextMenu.Root>.',
    );
  }
  return context;
}
