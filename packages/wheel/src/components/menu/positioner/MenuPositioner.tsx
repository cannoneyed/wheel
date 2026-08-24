/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createEffect, onCleanup, Show, splitProps, type JSX } from 'solid-js';
import { FloatingNode } from '../../floating-ui-solid';
import { CompositeList } from '../../internals/composite';
import { useMenuRootContext } from '../root/MenuRootContext';
import { MenuPositionerContext } from './MenuPositionerContext';
import {
  useAnchorPositioning,
  type Align,
  type Side,
  type UseAnchorPositioningSharedParameters,
} from '../../utils/useAnchorPositioning';
import type { BaseUIComponentProps } from '../../internals/types';
import { createPositioner } from '../../utils/createPositioner';
import { InternalBackdrop } from '../../utils/InternalBackdrop';
import { useMenuPortalContext } from '../portal/MenuPortalContext';
import { DROPDOWN_COLLISION_AVOIDANCE, POPUP_COLLISION_AVOIDANCE } from '../../internals/constants';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import type { MenuOpenEventDetails } from '../utils/types';
import type { MenuRoot } from '../root/MenuRoot';
import { useAnchoredPopupScrollLock } from '../../utils/useAnchoredPopupScrollLock';
import { useContextMenuRootContext } from '../../context-menu/root/ContextMenuRootContext';
import type { MenubarContext } from '../../menubar/MenubarContext';

/**
 * Positions the menu popup against the trigger.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Menu](https://base-ui.com/react/components/menu)
 *
 * Deviations: no `Menu.Viewport` support (`hasViewport`/`adaptiveOrigin` are always off — see the
 * port's final report for the `Menu.Viewport` skip rationale, matching `TooltipPositioner`'s
 * precedent).
 *
 * Context Menu support (additive, reading `useContextMenuRootContext(true)` directly rather than
 * threading a `'context-menu'` variant through `MenuParent`/`MenuStore`, since nothing else here
 * needs to branch on it): only the *root* positioner of a `ContextMenu.Root` — i.e. one whose own
 * `store`'s `parent` is still `{ type: undefined }`, not a genuine submenu (`parent.type ===
 * 'menu'`) that merely happens to render somewhere inside a context menu's tree — anchors at the
 * click/long-press point, uses fixed positioning, and skips the arrow inset. `positionMethod:
 * 'fixed'` itself applies to every positioner in the tree (including submenus), matching upstream:
 * a `position: fixed` ancestor changes the containing block for descendants, so submenus need the
 * same strategy to stay correctly anchored.
 */
export function MenuPositioner(componentProps: MenuPositioner.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'anchor',
    'positionMethod',
    'side',
    'align',
    'sideOffset',
    'alignOffset',
    'collisionBoundary',
    'collisionPadding',
    'arrowPadding',
    'sticky',
    'disableAnchorTracking',
    'collisionAvoidance',
  ]);

  const { store } = useMenuRootContext();
  const keepMounted = useMenuPortalContext();
  const contextMenuContext = useContextMenuRootContext(true);

  const parent = store.useState('parent');
  const floatingTreeRoot = store.useState('floatingTreeRoot');
  const mounted = store.useState('mounted');
  const open = store.useState('open');
  const modal = store.useState('modal');
  const openMethod = store.useState('openMethod');
  const triggerElement = store.useState('activeTriggerElement');
  const instantType = store.useState('instantType');
  const floatingNodeId = store.useState('floatingNodeId');
  const floatingParentNodeId = store.useState('floatingParentNodeId');

  const nested = () => parent().type === 'menu';
  // Only the root positioner of a `ContextMenu.Root` — never a genuine submenu that happens to be
  // nested somewhere inside one's tree (see the component doc comment above).
  const isContextMenuRoot = () => contextMenuContext !== undefined && !nested();
  // A menu directly hosted by a `<Menubar>` (see `MenuRoot.tsx`'s doc comment on menubar
  // integration). Reads the `MenubarContext` value off the store's `parent` (narrowed locally so
  // TypeScript can see the `'menubar'` variant's `context` field).
  const menubarParentContext = (): MenubarContext | undefined => {
    const p = parent();
    return p.type === 'menubar' ? p.context : undefined;
  };

  const computedSide = () => {
    if (local.side) {
      return local.side;
    }
    if (nested()) {
      return 'inline-end';
    }
    const menubar = menubarParentContext();
    if (menubar) {
      return menubar.orientation() === 'vertical' ? 'inline-end' : 'bottom';
    }
    return undefined;
  };
  const computedAlign = () =>
    local.align ?? (nested() || isContextMenuRoot() || menubarParentContext() ? 'start' : undefined);
  const computedCollisionAvoidance = () =>
    local.collisionAvoidance ?? (nested() ? POPUP_COLLISION_AVOIDANCE : DROPDOWN_COLLISION_AVOIDANCE);
  // Upstream nudges the popup slightly off the exact cursor point so it doesn't spawn directly
  // under the pointer (which would immediately highlight/activate the item there).
  const usesContextMenuOffsetDefaults = () =>
    isContextMenuRoot() && !local.side && computedAlign() !== 'center';
  const computedSideOffset = () => (usesContextMenuOffsetDefaults() ? (local.sideOffset ?? -5) : (local.sideOffset ?? 0));
  const computedAlignOffset = () => (usesContextMenuOffsetDefaults() ? (local.alignOffset ?? 2) : (local.alignOffset ?? 0));
  const computedAnchor = () => local.anchor ?? (isContextMenuRoot() ? contextMenuContext!.anchor() : undefined);
  const computedArrowPadding = () => (isContextMenuRoot() ? 0 : (local.arrowPadding ?? 5));
  const computedShiftCrossAxis = () => {
    if (!isContextMenuRoot()) {
      return undefined;
    }
    const avoidance = computedCollisionAvoidance();
    return !('side' in avoidance && avoidance.side === 'flip');
  };

  const positioning = useAnchorPositioning({
    anchor: computedAnchor,
    // Every positioner within a context menu's tree (including submenus) uses fixed positioning —
    // see the component doc comment for why this isn't restricted to `isContextMenuRoot()`.
    positionMethod: () => (contextMenuContext !== undefined ? 'fixed' : (local.positionMethod ?? 'absolute')),
    floatingRootContext: store.state.floatingRootContext,
    mounted,
    side: () => computedSide() ?? 'bottom',
    sideOffset: computedSideOffset,
    align: () => computedAlign() ?? 'center',
    alignOffset: computedAlignOffset,
    collisionBoundary: () => local.collisionBoundary ?? 'clipping-ancestors',
    collisionPadding: () => local.collisionPadding ?? 5,
    sticky: () => local.sticky ?? false,
    arrowPadding: computedArrowPadding,
    disableAnchorTracking: () => local.disableAnchorTracking ?? false,
    keepMounted: () => keepMounted,
    collisionAvoidance: computedCollisionAvoidance,
    nodeId: floatingNodeId(),
    externalTree: floatingTreeRoot(),
    adaptiveOrigin: undefined,
    shiftCrossAxis: computedShiftCrossAxis,
  });

  // Coordinate sibling open/close across the FloatingTree: notify ancestors this node opened, and
  // close this submenu if a sibling (same parent) opens or the parent itself closes.
  createEffect(() => {
    function onMenuOpenChange(details: MenuOpenEventDetails) {
      if (details.open) {
        if (details.parentNodeId === floatingNodeId()) {
          store.set('hoverEnabled', false);
        }
        if (details.nodeId !== floatingNodeId() && details.parentNodeId === floatingParentNodeId()) {
          store.setOpen(false, createChangeEventDetails(REASONS.siblingOpen));
        }
      }
    }

    floatingTreeRoot().events.on('menuopenchange', onMenuOpenChange);
    onCleanup(() => {
      floatingTreeRoot().events.off('menuopenchange', onMenuOpenChange);
    });
  });

  createEffect(() => {
    if (floatingParentNodeId() == null) {
      return;
    }

    function onParentClose(details: MenuOpenEventDetails) {
      if (details.open || details.nodeId !== floatingParentNodeId()) {
        return;
      }
      const reason: MenuRoot.ChangeEventReason = details.reason ?? REASONS.siblingOpen;
      store.setOpen(false, createChangeEventDetails(reason));
    }

    floatingTreeRoot().events.on('menuopenchange', onParentClose);
    onCleanup(() => {
      floatingTreeRoot().events.off('menuopenchange', onParentClose);
    });
  });

  // Close unrelated sibling submenus when hovering a different item in the parent menu.
  createEffect(() => {
    function onItemHover(event: { nodeId: string | undefined; target: Element | null }) {
      if (!open() || event.nodeId !== floatingParentNodeId()) {
        return;
      }

      if (event.target && triggerElement() && triggerElement() !== event.target) {
        store.setOpen(false, createChangeEventDetails(REASONS.siblingOpen));
      }
    }

    floatingTreeRoot().events.on('itemhover', onItemHover);
    onCleanup(() => {
      floatingTreeRoot().events.off('itemhover', onItemHover);
    });
  });

  createEffect(() => {
    const eventDetails: MenuOpenEventDetails = {
      open: open(),
      nodeId: floatingNodeId(),
      parentNodeId: floatingParentNodeId(),
      reason: store.state.openChangeReason,
    };
    floatingTreeRoot().events.emit('menuopenchange', eventDetails);
  });

  const state: MenuPositioner.State = {
    get open() {
      return open();
    },
    get side() {
      return positioning.side();
    },
    get align() {
      return positioning.align();
    },
    get anchorHidden() {
      return positioning.anchorHidden();
    },
    get nested() {
      return nested();
    },
    get instant() {
      return instantType();
    },
  };

  const popupModal = () => modal() && store.state.openChangeReason !== REASONS.triggerHover;
  // A menubar-hosted menu's modal-ness comes from the Menubar's own `modal` prop, not this store's
  // `modal` state (which the `MenuStore.modal` selector only ever derives for a top-level,
  // parent-less menu — see `MenuRoot.tsx`'s doc comment).
  const menubarModal = () => Boolean(menubarParentContext()?.modal());

  useAnchoredPopupScrollLock(
    () => open() && (menubarModal() || (!nested() && popupModal())),
    () => openMethod() === 'touch',
    () => store.state.positionerElement,
    () => triggerElement() as Element | null,
  );

  const shouldRenderBackdrop = () => mounted() && !nested() && (menubarModal() || popupModal());
  // Cuts a hole in the backdrop so pointer interaction with the menubar (or, for a top-level
  // dropdown menu, the trigger itself) still reaches through.
  const backdropCutout = (): Element | null => {
    const menubar = menubarParentContext();
    if (menubar) {
      return menubar.contentElement();
    }
    return triggerElement() as Element | null;
  };

  return (
    <MenuPositionerContext.Provider value={positioning}>
      <Show when={shouldRenderBackdrop()}>
        <InternalBackdrop
          ref={
            isContextMenuRoot()
              ? (el: HTMLDivElement) => {
                  contextMenuContext!.internalBackdropRef.current = el;
                }
              : undefined
          }
          inert={!open()}
          cutout={backdropCutout()}
        />
      </Show>
      <FloatingNode id={floatingNodeId()}>
        <CompositeList elements={store.context.itemDomElements} labels={store.context.itemLabels}>
          {createPositioner(componentProps, state, {
            styles: positioning.positionerStyles,
            transitionStatus: store.useState('transitionStatus'),
            props: elementProps,
            refs: (el: HTMLElement | null) => {
              store.set('positionerElement', el);
              if (isContextMenuRoot()) {
                contextMenuContext!.positionerRef.current = el;
              }
            },
            hidden: () => !mounted(),
            inert: () => !open(),
          })}
        </CompositeList>
      </FloatingNode>
    </MenuPositionerContext.Provider>
  );
}

export interface MenuPositionerState {
  /**
   * Whether the menu is currently open.
   */
  open: boolean;
  /**
   * The side of the anchor the component is placed on.
   */
  side: Side;
  /**
   * The alignment of the component relative to the anchor.
   */
  align: Align;
  /**
   * Whether the anchor element is hidden.
   */
  anchorHidden: boolean;
  /**
   * Whether the component is nested.
   */
  nested: boolean;
  /**
   * Whether CSS transitions should be disabled.
   */
  instant: string | undefined;
}

export interface MenuPositionerProps
  extends UseAnchorPositioningSharedParameters,
    BaseUIComponentProps<'div', MenuPositionerState> {}

export namespace MenuPositioner {
  export type State = MenuPositionerState;
  export type Props = MenuPositionerProps;
}
