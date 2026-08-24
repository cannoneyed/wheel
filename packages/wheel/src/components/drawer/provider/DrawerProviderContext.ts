/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext } from 'solid-js';

export interface DrawerProviderContext {
  setDrawerOpen: (drawerId: string, open: boolean) => void;
  removeDrawer: (drawerId: string) => void;
  readonly active: boolean;
  readonly visualStateStore: DrawerVisualStateStore;
}

export const DrawerProviderContext = createContext<DrawerProviderContext | undefined>(undefined);

export interface DrawerVisualState {
  swipeProgress: number;
  frontmostHeight: number;
}

/**
 * Solid port deviation: upstream's `DrawerVisualStateStore` is a hand-rolled pub/sub object (like
 * `DrawerNestedSwipeProgressStore`) used to avoid re-rendering the whole React tree on every drag
 * frame. `Drawer.Indent`/`Drawer.IndentBackground` read it directly (not through Solid's reactivity)
 * because they can be rendered arbitrarily far from the drawer tree, outside any store's ownership —
 * so a plain external subscribe/getSnapshot object (rather than a Solid signal, which would need to
 * be created and shared through this same context anyway) is kept, matching upstream's shape and
 * consumer contract (`Drawer.Indent`'s `subscribe`/`getSnapshot` usage) exactly.
 */
export interface DrawerVisualStateStore {
  getSnapshot: () => DrawerVisualState;
  subscribe: (listener: () => void) => () => void;
  set: (state: Partial<DrawerVisualState>) => void;
}

export function useDrawerProviderContext(optional?: false): DrawerProviderContext;
export function useDrawerProviderContext(optional: true): DrawerProviderContext | undefined;
export function useDrawerProviderContext(optional?: boolean) {
  const context = useContext(DrawerProviderContext);

  if (context === undefined && !optional) {
    throw new Error('Base UI: DrawerProviderContext is missing. Use <Drawer.Provider>.');
  }

  return context;
}
