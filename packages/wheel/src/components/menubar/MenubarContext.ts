/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext, type Accessor } from 'solid-js';
import type { MenuRoot } from '../menu/root/MenuRoot';

/**
 * Solid port of upstream's `MenubarContext`.
 *
 * Deviation: no `allowMouseUpTriggerRef` — that field backs upstream's mousedown-then-mouseup-on-
 * item "drag select" affordance, which `Menu.Trigger`'s own port already drops as a secondary UX
 * nicety (see `menu/trigger/MenuTrigger.tsx`'s doc comment), so nothing reads or writes it here.
 */
export interface MenubarContext {
  modal: Accessor<boolean>;
  disabled: Accessor<boolean>;
  contentElement: Accessor<HTMLElement | null>;
  setContentElement: (element: HTMLElement | null) => void;
  hasSubmenuOpen: Accessor<boolean>;
  setHasSubmenuOpen: (open: boolean) => void;
  orientation: Accessor<MenuRoot.Orientation>;
  rootId: Accessor<string | undefined>;
}

export const MenubarContext = createContext<MenubarContext | undefined>(undefined);

export function useMenubarContext(optional?: false): MenubarContext;
export function useMenubarContext(optional: true): MenubarContext | undefined;
export function useMenubarContext(optional?: boolean) {
  const context = useContext(MenubarContext);
  if (context === undefined && !optional) {
    throw new Error(
      'Base UI: MenubarContext is missing. Menubar parts must be placed within <Menubar>.',
    );
  }

  return context;
}
