/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import { useMenuRootContext } from '../root/MenuRootContext';
import { renderElement } from '../../internals/renderElement';
import type { BaseUIComponentProps } from '../../internals/types';
import type { StateAttributesMapping } from '../../internals/getStateAttributesProps';
import { popupStateMapping as baseMapping } from '../../utils/popupStateMapping';
import type { TransitionStatus } from '../../internals/createTransitionStatus';
import { transitionStatusMapping } from '../../internals/stateAttributesMapping';
import { REASONS } from '../../internals/reasons';
import { useContextMenuRootContext } from '../../context-menu/root/ContextMenuRootContext';

const stateAttributesMapping: StateAttributesMapping<MenuBackdropState> = {
  ...baseMapping,
  ...transitionStatusMapping,
};

/**
 * An overlay displayed beneath the menu popup.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Menu](https://base-ui.com/react/components/menu)
 *
 * Additive: when rendered inside a `ContextMenu.Root`, the element is also synced onto
 * `ContextMenuRootContext.backdropRef` so `ContextMenu.Trigger` can recognize a right click on the
 * backdrop as "inside" and suppress the native context menu there too.
 */
export function MenuBackdrop(componentProps: MenuBackdrop.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, ['class', 'style', 'as', 'asChild', 'children']);

  const { store } = useMenuRootContext();
  const contextMenuContext = useContextMenuRootContext(true);
  const open = store.useState('open');
  const mounted = store.useState('mounted');
  const transitionStatus = store.useState('transitionStatus');

  const state: MenuBackdrop.State = {
    get open() {
      return open();
    },
    get transitionStatus() {
      return transitionStatus();
    },
  };

  return renderElement('div', componentProps, {
    defaultClass: 'wheel-Menu-Backdrop',
    slot: 'menu-backdrop',
    state,
    ref: contextMenuContext
      ? (el: HTMLElement | null) => {
          contextMenuContext.backdropRef.current = el;
        }
      : undefined,
    stateAttributesMapping,
    props: [
      () => ({
        role: 'presentation' as const,
        hidden: !mounted(),
        style: {
          'pointer-events': store.state.openChangeReason === REASONS.triggerHover ? 'none' : undefined,
          'user-select': 'none',
          '-webkit-user-select': 'none',
        },
      }),
      elementProps,
    ],
  });
}

export interface MenuBackdropState {
  /**
   * Whether the menu is currently open.
   */
  open: boolean;
  /**
   * The transition status of the component.
   */
  transitionStatus: TransitionStatus;
}

export interface MenuBackdropProps extends BaseUIComponentProps<'div', MenuBackdropState> {}

export namespace MenuBackdrop {
  export type State = MenuBackdropState;
  export type Props = MenuBackdropProps;
}
