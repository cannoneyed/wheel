/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import type { Accessor } from 'solid-js';
import { platform } from '../../base-utils/platform/index';
import type { HTMLProps } from '../../internals/types';
import { REASONS } from '../../internals/reasons';
import type { MenuStore } from '../store/MenuStore';
import { useContextMenuRootContext } from '../../context-menu/root/ContextMenuRootContext';

export interface CreateMenuItemCommonPropsParameters {
  closeOnClick: Accessor<boolean>;
  highlighted: Accessor<boolean>;
  id: Accessor<string | undefined>;
  nodeId: string | undefined;
  store: MenuStore<any>;
  typingRef?: { current: boolean } | undefined;
}

/**
 * The shared id/role/tabIndex/keydown/mousemove/click props used by every item-like part
 * (`Menu.Item`, `Menu.CheckboxItem`, `Menu.RadioItem`, `Menu.SubmenuTrigger`, `Menu.LinkItem`).
 * Solid port of upstream's `useMenuItemCommonProps`.
 *
 * Bugfix (found while porting Context Menu, applies to plain Menu too): `onMouseMove`/`onClick`
 * used to emit `itemhover`/`close` on `params.store.state.floatingTreeRoot` — the store's *raw*,
 * undelegated state field. For a submenu's own store, that's a private `FloatingTreeStore`
 * instance distinct from the shared/delegated one every other part (`Menu.Positioner`,
 * `Menu.Popup`) reads via `store.useState('floatingTreeRoot')` (see `MenuStore.ts`'s
 * `floatingTreeRoot` selector, which delegates to the parent for `parent.type === 'menu'`) — so a
 * submenu item's click/hover events were emitted on a bus nobody (not even its own `Menu.Popup`)
 * was listening to. Reading the delegated selector here instead makes clicking a submenu item
 * close it (and, since the same emit reaches every ancestor listening on the shared bus, its
 * ancestors too) — surfaced by `ContextMenu.Root`'s "closes nested submenus when releasing the
 * context menu pointer over an item" test, which exercises exactly this path.
 *
 * Deviation: the generic press-drag-release "mouseup on item activates it" affordance (gated
 * upstream by `store.context.allowMouseUpTriggerRef`, set only once a *registered* `Menu.Trigger`
 * was pressed) is not ported for plain menus — see `MenuStore.ts`'s doc comment. The `onMouseUp`
 * handler below is additive and scoped ONLY to items rendered inside a `ContextMenu.Root` (read via
 * `useContextMenuRootContext(true)`, mirroring upstream's own coupling): a context menu has no
 * registered trigger to gate on, and its own test suite exercises this "release over an item"
 * activation path directly (right-click-and-hold, drag to an item, release), so it's reinstated
 * for that case specifically rather than left dropped like the rest of the affordance.
 */
export function createMenuItemCommonProps(params: CreateMenuItemCommonPropsParameters): HTMLProps {
  const typingRef = params.typingRef ?? params.store.context.typingRef;
  const contextMenuContext = useContextMenuRootContext(true);
  const floatingTreeRoot = params.store.useState('floatingTreeRoot');

  return {
    get id() {
      return params.id();
    },
    role: 'menuitem',
    get tabIndex() {
      return params.store.state.open && params.highlighted() ? 0 : -1;
    },
    onKeyDown(event: KeyboardEvent) {
      if (event.key === ' ' && typingRef.current) {
        event.preventDefault();
      }
    },
    onMouseMove(event: MouseEvent) {
      if (!params.nodeId) {
        return;
      }
      floatingTreeRoot().events.emit('itemhover', {
        nodeId: params.nodeId,
        target: event.currentTarget,
      });
    },
    onClick(event: MouseEvent) {
      if (params.closeOnClick()) {
        floatingTreeRoot().events.emit('close', {
          domEvent: event,
          reason: REASONS.itemPress,
        });
      }
    },
    onMouseUp(event: MouseEvent) {
      if (!contextMenuContext) {
        return;
      }

      const initialCursorPoint = contextMenuContext.initialCursorPointRef.current;
      contextMenuContext.initialCursorPointRef.current = null;

      if (
        initialCursorPoint &&
        Math.abs(event.clientX - initialCursorPoint.x) <= 1 &&
        Math.abs(event.clientY - initialCursorPoint.y) <= 1
      ) {
        // The mouseup lands exactly where the context menu spawned from — this is the release of
        // the same physical right-click/long-press that opened it, not an intentional selection.
        return;
      }

      // On non-macOS platforms, this mouseup belongs to the right-click gesture that opened the
      // context menu, so it must not activate an item.
      if (!platform.os.mac && event.button === 2) {
        return;
      }

      if (event.button === 2) {
        // The user pressed on the trigger, dragged the cursor, and released it over this item.
        // Trigger the click and let `onClick` above close the menu.
        (event.currentTarget as HTMLElement | null)?.click();
      }
    },
  };
}
