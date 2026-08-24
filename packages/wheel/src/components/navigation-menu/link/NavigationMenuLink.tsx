/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import { useFloatingTree } from '../../floating-ui-solid';
import type { BaseUIComponentProps, HTMLProps } from '../../internals/types';
import {
  useNavigationMenuRootContext,
  useNavigationMenuTreeContext,
} from '../root/NavigationMenuRootContext';
import { isOutsideMenuEvent } from '../utils/isOutsideMenuEvent';
import { createCompositeItem } from '../../internals/composite/item/createCompositeItem';
import { renderElement } from '../../internals/renderElement';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';

/**
 * A link in the navigation menu that can be used to navigate to a different page or section.
 * Renders an `<a>` element.
 *
 * Documentation: [Base UI Navigation Menu](https://base-ui.com/react/components/navigation-menu)
 */
export function NavigationMenuLink(componentProps: NavigationMenuLink.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'ref',
    'active',
    'closeOnClick',
  ]);

  const active = () => componentProps.active ?? false;
  const closeOnClick = () => componentProps.closeOnClick ?? false;

  const { setValue, popupElement, positionerElement, rootRef } = useNavigationMenuRootContext();
  const nodeId = useNavigationMenuTreeContext();
  const tree = useFloatingTree();

  const state: NavigationMenuLinkState = {
    get active() {
      return active();
    },
  };

  const { compositeProps, compositeRef } = createCompositeItem<never>({});

  const defaultProps = (): HTMLProps => ({
    'aria-current': active() ? 'page' : undefined,
    tabIndex: undefined,
    onClick(event: MouseEvent) {
      if (closeOnClick()) {
        setValue(null, createChangeEventDetails(REASONS.linkPress, event));
      }
    },
    onBlur(event: FocusEvent) {
      const positioner = positionerElement();
      const popup = popupElement();
      if (
        positioner &&
        popup &&
        isOutsideMenuEvent(
          {
            currentTarget: event.currentTarget as HTMLElement,
            relatedTarget: event.relatedTarget as HTMLElement | null,
          },
          { popupElement: popup, rootRef, tree, nodeId },
        )
      ) {
        setValue(null, createChangeEventDetails(REASONS.focusOut, event));
      }
    },
  });

  return renderElement('a', componentProps, {
    defaultClass: 'wheel-NavigationMenu-Link',
    slot: 'navigation-menu-link',
    state,
    ref: compositeRef,
    props: [compositeProps, defaultProps, elementProps],
  });
}

export interface NavigationMenuLinkState {
  /**
   * Whether the link is the currently active page.
   */
  active: boolean;
}

export interface NavigationMenuLinkProps
  extends BaseUIComponentProps<'a', NavigationMenuLinkState> {
  /**
   * Whether the link is the currently active page.
   * @default false
   */
  active?: boolean | undefined;
  /**
   * Whether to close the navigation menu when the link is clicked.
   * @default false
   */
  closeOnClick?: boolean | undefined;
}

export namespace NavigationMenuLink {
  export type State = NavigationMenuLinkState;
  export type Props = NavigationMenuLinkProps;
}
