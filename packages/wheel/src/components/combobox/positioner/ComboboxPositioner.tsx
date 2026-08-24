/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createEffect, splitProps, type JSX } from 'solid-js';
import { inertValue } from '../../base-utils/inertValue';
import { useComboboxFloatingContext, useComboboxRootContext } from '../root/ComboboxRootContext';
import { useFilteredItems } from '../root/utils/useFilteredItems';
import { ComboboxPositionerContext } from './ComboboxPositionerContext';
import {
  useAnchorPositioning,
  type UseAnchorPositioningSharedParameters,
} from '../../utils/useAnchorPositioning';
import type { BaseUIComponentProps } from '../../internals/types';
import { useComboboxPortalContext } from '../portal/ComboboxPortalContext';
import { DROPDOWN_COLLISION_AVOIDANCE } from '../../internals/constants';
import { InternalBackdrop } from '../../utils/InternalBackdrop';
import { createPositioner } from '../../utils/createPositioner';
import { useAnchoredPopupScrollLock } from '../../utils/useAnchoredPopupScrollLock';
import type { Align, Side } from '../../utils/useAnchorPositioning';

/**
 * Positions the popup against the trigger.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Combobox](https://base-ui.com/react/components/combobox)
 */
export function ComboboxPositioner(componentProps: ComboboxPositioner.Props): JSX.Element {
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

  const store = useComboboxRootContext();
  const filteredItems = useFilteredItems();
  const floatingRootContext = useComboboxFloatingContext();
  const keepMounted = useComboboxPortalContext();

  const modal = store.useState('modal');
  const open = store.useState('open');
  const mounted = store.useState('mounted');
  const positionerElement = store.useState('positionerElement');
  const triggerElement = store.useState('triggerElement');
  const inputElement = store.useState('inputElement');
  const inputGroupElement = store.useState('inputGroupElement');
  const inputInsidePopup = store.useState('inputInsidePopup');
  const transitionStatus = store.useState('transitionStatus');

  const empty = () => filteredItems().length === 0;
  const resolvedAnchor = () =>
    local.anchor ?? (inputInsidePopup() ? triggerElement() : (inputGroupElement() ?? inputElement()));

  const positioning = useAnchorPositioning({
    anchor: resolvedAnchor,
    floatingRootContext,
    positionMethod: () => local.positionMethod ?? 'absolute',
    mounted,
    side: () => local.side ?? 'bottom',
    sideOffset: () => local.sideOffset ?? 0,
    align: () => local.align ?? 'center',
    alignOffset: () => local.alignOffset ?? 0,
    arrowPadding: () => local.arrowPadding ?? 5,
    collisionBoundary: () => local.collisionBoundary ?? 'clipping-ancestors',
    collisionPadding: () => local.collisionPadding ?? 5,
    sticky: () => local.sticky ?? false,
    disableAnchorTracking: () => local.disableAnchorTracking ?? false,
    keepMounted: () => keepMounted,
    collisionAvoidance: () => local.collisionAvoidance ?? DROPDOWN_COLLISION_AVOIDANCE,
    lazyFlip: () => true,
  });

  useAnchoredPopupScrollLock(
    () => open() && modal(),
    () => store.state.openMethod === 'touch',
    positionerElement,
    triggerElement,
  );

  const state: ComboboxPositioner.State = {
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
    get empty() {
      return empty();
    },
  };

  createEffect(() => {
    store.set('popupSide', positioning.side());
  });

  const contextValue: ComboboxPositionerContext = {
    side: positioning.side,
    align: positioning.align,
    arrowStyles: positioning.arrowStyles,
    setArrowElement: positioning.setArrowElement,
    arrowUncentered: positioning.arrowUncentered,
    anchorHidden: positioning.anchorHidden,
    isPositioned: positioning.isPositioned,
  };

  return (
    <ComboboxPositionerContext.Provider value={contextValue}>
      {mounted() && modal() ? (
        <InternalBackdrop
          inert={inertValue(!open())}
          cutout={inputGroupElement() ?? inputElement() ?? triggerElement()}
        />
      ) : null}
      {createPositioner(componentProps, state, {
        styles: positioning.positionerStyles,
        transitionStatus,
        props: elementProps,
        refs: (el: HTMLElement | null) => store.set('positionerElement', el),
        hidden: () => !mounted(),
        inert: () => !open(),
      })}
    </ComboboxPositionerContext.Provider>
  );
}

export interface ComboboxPositionerState {
  /**
   * Whether the popup is currently open.
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
   * Whether there are no items to display.
   */
  empty: boolean;
}

export interface ComboboxPositionerProps
  extends UseAnchorPositioningSharedParameters,
    BaseUIComponentProps<'div', ComboboxPositionerState> {}

export namespace ComboboxPositioner {
  export type State = ComboboxPositionerState;
  export type Props = ComboboxPositionerProps;
}
