/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { useSignal } from '../../../core/local-state';
import { type JSX } from 'solid-js';
import { Menu } from '../../menu';
import { MenuRootContext } from '../../menu/root/MenuRootContext';
import type { MenuRoot } from '../../menu/root/MenuRoot';
import type { BaseUIChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import {
  ContextMenuRootContext,
  type ContextMenuAnchor,
  type ContextMenuRootContextValue,
} from './ContextMenuRootContext';

/**
 * A component that creates a context menu activated by right clicking or long pressing.
 * Doesn't render its own HTML element.
 *
 * Documentation: [Base UI Context Menu](https://base-ui.com/react/components/context-menu)
 *
 * Deviations from upstream:
 * - No `actionsRef`/imperative-handle indirection between this root and `ContextMenu.Trigger`.
 *   Upstream forwards `setOpen` through `ContextMenuRootContext.actionsRef` because its
 *   `Menu.Root` wraps a component-level `setOpen` closure with extra bookkeeping (the
 *   `openEventRef` grace period, etc). This Solid Menu port already moved that bookkeeping onto
 *   `MenuStore.setOpen` itself (see `menu/store/MenuStore.ts`), so `ContextMenu.Trigger` calls
 *   `store.setOpen` directly (obtained via `useMenuRootContext`, exactly like `Menu.Trigger`
 *   does) instead of threading an `actionsRef`/`positionerRef` pair through this context for that
 *   purpose. `positionerRef` is still exposed (and set by `Menu.Positioner`) for the mouseup/
 *   containment check `ContextMenu.Trigger` performs.
 * - No `rootId`/`findRootOwnerId` nested-context-menu mouseup disambiguation — only the 500ms
 *   grace timer and positioner containment are ported (see `ContextMenuTrigger.tsx`'s doc
 *   comment); not exercised by the ported test slice.
 */
export function ContextMenuRoot(props: ContextMenuRoot.Props): JSX.Element {
  const [anchor, setAnchorSignal] = useSignal<ContextMenuAnchor>({
    getBoundingClientRect() {
      return DOMRect.fromRect({ width: 0, height: 0, x: 0, y: 0 });
    },
  }, 'anchor');

  const backdropRef: { current: HTMLElement | null } = { current: null };
  const internalBackdropRef: { current: HTMLElement | null } = { current: null };
  const positionerRef: { current: HTMLElement | null } = { current: null };
  const initialCursorPointRef: { current: { x: number; y: number } | null } = { current: null };

  const contextValue: ContextMenuRootContextValue = {
    anchor,
    setAnchor(next) {
      setAnchorSignal(next);
    },
    backdropRef,
    internalBackdropRef,
    positionerRef,
    initialCursorPointRef,
  };

  return (
    <ContextMenuRootContext.Provider value={contextValue}>
      <MenuRootContext.Provider value={undefined}>
        <Menu.Root {...props} />
      </MenuRootContext.Provider>
    </ContextMenuRootContext.Provider>
  );
}

export interface ContextMenuRootState {}

export interface ContextMenuRootProps
  extends Omit<MenuRoot.Props, 'triggerId' | 'defaultTriggerId' | 'modal' | 'onOpenChange' | 'children'> {
  /**
   * Event handler called when the menu is opened or closed.
   */
  onOpenChange?:
    | ((open: boolean, eventDetails: ContextMenuRoot.ChangeEventDetails) => void)
    | undefined;
  children?: JSX.Element | undefined;
}

export type ContextMenuRootChangeEventReason = MenuRoot.ChangeEventReason;
export type ContextMenuRootChangeEventDetails =
  BaseUIChangeEventDetails<ContextMenuRootChangeEventReason>;

export namespace ContextMenuRoot {
  export type State = ContextMenuRootState;
  export type Props = ContextMenuRootProps;
  export type ChangeEventReason = ContextMenuRootChangeEventReason;
  export type ChangeEventDetails = ContextMenuRootChangeEventDetails;
}
