/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import type { BaseUIComponentProps } from '../../internals/types';
import { renderElement } from '../../internals/renderElement';
import { useNavigationMenuRootContext } from '../root/NavigationMenuRootContext';
import type { TransitionStatus } from '../../internals/createTransitionStatus';
import { createBaseUiId } from '../../internals/createBaseUiId';
import { useNavigationMenuPositionerContext } from '../positioner/NavigationMenuPositionerContext';
import { useDirection } from '../../internals/direction-context/DirectionContext';
import type { Align, Side } from '../../utils/useAnchorPositioning';
import { getDisabledMountTransitionStyles } from '../../utils/getDisabledMountTransitionStyles';
import { navigationMenuPopupStateAttributesMapping } from './stateAttributesMapping';

/**
 * A container for the navigation menu contents.
 * Renders a `<nav>` element.
 *
 * Documentation: [Base UI Navigation Menu](https://base-ui.com/react/components/navigation-menu)
 */
export function NavigationMenuPopup(componentProps: NavigationMenuPopup.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'ref',
    'id',
  ]);

  const { open, transitionStatus, setPopupElement } = useNavigationMenuRootContext();
  const positioning = useNavigationMenuPositionerContext();
  const direction = useDirection();

  const id = createBaseUiId(() => componentProps.id);

  const state: NavigationMenuPopupState = {
    get open() {
      return open();
    },
    get transitionStatus() {
      return transitionStatus();
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
  };

  // Ensure popup size transitions correctly when anchored to `bottom` (side=top) or `right` (side=left).
  const isPhysicalLeft = () => {
    const side = positioning.side();
    if (side === 'left') {
      return true;
    }
    if (direction() === 'rtl') {
      return side === 'inline-end';
    }
    return side === 'inline-start';
  };
  const isOriginSide = () => positioning.side() === 'top' || isPhysicalLeft();

  return renderElement('nav', componentProps, {
    defaultClass: 'wheel-NavigationMenu-Popup',
    slot: 'navigation-menu-popup',
    state,
    ref: setPopupElement,
    props: [
      () => ({
        id: id(),
        tabIndex: -1,
        style: isOriginSide()
          ? {
              position: 'absolute',
              [positioning.side() === 'top' ? 'bottom' : 'top']: '0',
              [isPhysicalLeft() ? 'right' : 'left']: '0',
            }
          : {},
      }),
      () => getDisabledMountTransitionStyles(transitionStatus()),
      elementProps,
    ],
    stateAttributesMapping: navigationMenuPopupStateAttributesMapping,
  });
}

export interface NavigationMenuPopupState {
  /**
   * If `true`, the popup is open.
   */
  open: boolean;
  /**
   * The transition status of the popup.
   */
  transitionStatus: TransitionStatus;
  /**
   * The side of the anchor the popup is positioned on.
   */
  side: Side;
  /**
   * The alignment of the popup relative to the anchor.
   */
  align: Align;
  /**
   * Whether the anchor element is hidden.
   */
  anchorHidden: boolean;
}

export interface NavigationMenuPopupProps
  extends BaseUIComponentProps<'nav', NavigationMenuPopupState> {}

export namespace NavigationMenuPopup {
  export type State = NavigationMenuPopupState;
  export type Props = NavigationMenuPopupProps;
}
