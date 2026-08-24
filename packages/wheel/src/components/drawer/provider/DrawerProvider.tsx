/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-use-signal -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
import { createMemo, createSignal, type JSX } from 'solid-js';
import {
  DrawerProviderContext,
  type DrawerVisualState,
  type DrawerVisualStateStore,
} from './DrawerProviderContext';

/**
 * Provides a shared context for coordinating global Drawer UI, such as indent/background effects
 * based on whether any Drawer is open.
 * Doesn't render its own HTML element.
 *
 * Documentation: [Base UI Drawer](https://base-ui.com/react/components/drawer)
 */
export function DrawerProvider(props: DrawerProvider.Props): JSX.Element {
  const [openById, setOpenById] = createSignal(new Map<string, boolean>());
  const visualStateStore = createVisualStateStore();

  function setDrawerOpen(drawerId: string, open: boolean) {
    setOpenById((prev) => {
      const prevOpen = prev.get(drawerId);
      if (prevOpen === open) {
        return prev;
      }

      const next = new Map(prev);
      next.set(drawerId, open);
      return next;
    });
  }

  function removeDrawer(drawerId: string) {
    setOpenById((prev) => {
      if (!prev.has(drawerId)) {
        return prev;
      }

      const next = new Map(prev);
      next.delete(drawerId);
      return next;
    });
  }

  const active = createMemo(() => {
    for (const open of openById().values()) {
      if (open) {
        return true;
      }
    }
    return false;
  });

  const contextValue: DrawerProviderContext = {
    setDrawerOpen,
    removeDrawer,
    get active() {
      return active();
    },
    visualStateStore,
  };

  return (
    <DrawerProviderContext.Provider value={contextValue}>
      {props.children}
    </DrawerProviderContext.Provider>
  );
}

export interface DrawerProviderState {}

export interface DrawerProviderProps {
  children?: JSX.Element;
}

export namespace DrawerProvider {
  export type State = DrawerProviderState;
  export type Props = DrawerProviderProps;
}

type VisualStateListener = () => void;

function createVisualStateStore(): DrawerVisualStateStore {
  let state: DrawerVisualState = {
    swipeProgress: 0,
    frontmostHeight: 0,
  };
  const listeners = new Set<VisualStateListener>();

  return {
    getSnapshot: () => state,
    set(nextState) {
      let nextSwipeProgress = state.swipeProgress;
      if (nextState.swipeProgress !== undefined) {
        nextSwipeProgress = Number.isFinite(nextState.swipeProgress) ? nextState.swipeProgress : 0;
      }

      let nextFrontmostHeight = state.frontmostHeight;
      if (nextState.frontmostHeight !== undefined) {
        nextFrontmostHeight = Number.isFinite(nextState.frontmostHeight)
          ? nextState.frontmostHeight
          : 0;
      }

      if (nextSwipeProgress === state.swipeProgress && nextFrontmostHeight === state.frontmostHeight) {
        return;
      }

      state = {
        swipeProgress: nextSwipeProgress,
        frontmostHeight: nextFrontmostHeight,
      };

      listeners.forEach((listener) => {
        listener();
      });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
