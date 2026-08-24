/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-use-signal -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createEffect, createSignal, onCleanup, splitProps, type JSX } from 'solid-js';
import { FloatingNode, FloatingTree, useFloatingNodeId, useFloatingTree } from '../floating-ui-solid';
import type { MenuRoot } from '../menu/root/MenuRoot';
import type { MenuOpenEventDetails } from '../menu/utils/types';
import type { BaseUIComponentProps } from '../internals/types';
import { CompositeRoot } from '../internals/composite/root/CompositeRoot';
import { createBaseUiId } from '../internals/createBaseUiId';
import { REASONS } from '../internals/reasons';
import {
  MenubarContext,
  useMenubarContext,
  type MenubarContext as MenubarContextValue,
} from './MenubarContext';
import { menubarStateAttributesMapping } from './stateAttributesMapping';

/**
 * The container for menus.
 *
 * Documentation: [Base UI Menubar](https://base-ui.com/react/components/menubar)
 *
 * Deviations from upstream:
 * - No `allowMouseUpTriggerRef` on the context (see `MenubarContext.ts`'s doc comment) — the
 *   mousedown-then-mouseup-on-item "drag select" affordance it backs isn't ported.
 * - Only *contained* triggers are supported end to end (a `Menu.Trigger` that is a descendant of
 *   the `Menu.Root` it opens) — the Menu port doesn't carry `handle`/detached-trigger support at
 *   all (see `menu/root/MenuRoot.tsx`'s doc comment), so Menubar inherits that limitation.
 */
export function Menubar(componentProps: Menubar.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'orientation',
    'loopFocus',
    'modal',
    'disabled',
    'id',
  ]);

  const orientation = (): MenuRoot.Orientation => componentProps.orientation ?? 'horizontal';
  const loopFocus = () => componentProps.loopFocus ?? true;
  const modal = () => componentProps.modal ?? true;
  const disabled = () => componentProps.disabled ?? false;
  const id = createBaseUiId(() => componentProps.id);

  const [contentElement, setContentElement] = createSignal<HTMLElement | null>(null);
  const [hasSubmenuOpen, setHasSubmenuOpen] = createSignal(false);

  const context: MenubarContextValue = {
    contentElement,
    setContentElement,
    hasSubmenuOpen,
    setHasSubmenuOpen,
    modal,
    disabled,
    orientation,
    rootId: id,
  };

  const state: Menubar.State = {
    get orientation() {
      return orientation();
    },
    get modal() {
      return modal();
    },
    get hasSubmenuOpen() {
      return hasSubmenuOpen();
    },
  };

  return (
    <MenubarContext.Provider value={context}>
      <FloatingTree>
        <MenubarContent>
          <CompositeRoot
            defaultClass="wheel-Menubar"
            slot="menubar"
            tag="div"
            as={componentProps.as}
            asChild={componentProps.asChild}
            class={componentProps.class}
            style={componentProps.style}
            state={state}
            stateAttributesMapping={menubarStateAttributesMapping}
            refs={[
              ...(componentProps.ref ? [componentProps.ref] : []),
              (el: HTMLElement | null) => setContentElement(el),
            ]}
            props={[() => ({ role: 'menubar', id: id(), 'aria-orientation': orientation() }), elementProps]}
            orientation={orientation()}
            loopFocus={loopFocus()}
            enableHomeAndEndKeys
            highlightItemOnHover={hasSubmenuOpen()}
          >
            {componentProps.children}
          </CompositeRoot>
        </MenubarContent>
      </FloatingTree>
    </MenubarContext.Provider>
  );
}

/**
 * Establishes this Menubar's own node in the ambient `FloatingTree` (so nested `Menu.Root`s can
 * discover it — see `menu/root/MenuRoot.tsx`'s doc comment) and tracks whether any direct child
 * submenu is open, mirroring upstream's `MenubarContent`.
 */
function MenubarContent(props: { children?: JSX.Element }): JSX.Element {
  const nodeId = useFloatingNodeId();
  const tree = useFloatingTree();
  const rootContext = useMenubarContext();

  createEffect(() => {
    if (!tree) {
      return;
    }

    function onSubmenuOpenChange(details: MenuOpenEventDetails) {
      if (!details.nodeId || details.parentNodeId !== nodeId) {
        return;
      }

      if (details.open) {
        if (!rootContext.hasSubmenuOpen()) {
          rootContext.setHasSubmenuOpen(true);
        }
      } else if (details.reason !== REASONS.siblingOpen && details.reason !== REASONS.listNavigation) {
        rootContext.setHasSubmenuOpen(false);
      }
    }

    tree.events.on('menuopenchange', onSubmenuOpenChange);
    onCleanup(() => {
      tree.events.off('menuopenchange', onSubmenuOpenChange);
    });
  });

  return <FloatingNode id={nodeId}>{props.children}</FloatingNode>;
}

export interface MenubarState {
  /**
   * The orientation of the menubar.
   */
  orientation: MenuRoot.Orientation;
  /**
   * Whether the menubar is modal.
   */
  modal: boolean;
  /**
   * Whether any submenu within the menubar is open.
   */
  hasSubmenuOpen: boolean;
}

export interface MenubarProps extends BaseUIComponentProps<'div', MenubarState> {
  /**
   * Whether the menubar is modal.
   * @default true
   */
  modal?: boolean | undefined;
  /**
   * Whether the whole menubar is disabled.
   * @default false
   */
  disabled?: boolean | undefined;
  /**
   * The orientation of the menubar.
   * @default 'horizontal'
   */
  orientation?: MenuRoot.Orientation | undefined;
  /**
   * Whether to loop keyboard focus back to the first item
   * when the end of the list is reached while using the arrow keys.
   * @default true
   */
  loopFocus?: boolean | undefined;
}

export namespace Menubar {
  export type State = MenubarState;
  export type Props = MenubarProps;
}
