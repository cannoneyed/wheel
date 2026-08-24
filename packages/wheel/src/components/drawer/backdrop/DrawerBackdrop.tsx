/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import { useDrawerRootContext } from '../root/DrawerRootContext';
import { renderElement } from '../../internals/renderElement';
import type { TransitionStatus } from '../../internals/createTransitionStatus';
import type { BaseUIComponentProps } from '../../internals/types';
import type { StateAttributesMapping } from '../../internals/getStateAttributesProps';
import { popupStateMapping as baseMapping } from '../../utils/popupStateMapping';
import { transitionStatusMapping } from '../../internals/stateAttributesMapping';
import { DrawerBackdropCssVars } from './DrawerBackdropCssVars';
import { DrawerPopupCssVars } from '../popup/DrawerPopupCssVars';

const stateAttributesMapping: StateAttributesMapping<DrawerBackdropState> = {
  ...baseMapping,
  ...transitionStatusMapping,
};

/**
 * An overlay displayed beneath the popup.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Drawer](https://base-ui.com/react/components/drawer)
 */
export function DrawerBackdrop(componentProps: DrawerBackdrop.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'forceRender',
  ]);

  const forceRender = () => local.forceRender ?? false;

  const store = useDrawerRootContext();

  const open = store.useState('open');
  const nested = store.useState('nested');
  const mounted = store.useState('mounted');
  const transitionStatus = store.useState('transitionStatus');

  const state: DrawerBackdrop.State = {
    get open() {
      return open();
    },
    get transitionStatus() {
      return transitionStatus();
    },
  };

  return renderElement('div', componentProps, {
    defaultClass: 'wheel-Drawer-Backdrop',
    slot: 'drawer-backdrop',
    state,
    ref: (el: HTMLElement | null) => {
      store.context.backdropRef.current = el;
    },
    stateAttributesMapping,
    props: [
      () => ({
        role: 'presentation',
        hidden: !mounted(),
        style: {
          'pointer-events': !open() ? 'none' : undefined,
          'user-select': 'none',
          '-webkit-user-select': 'none',
          [DrawerBackdropCssVars.swipeProgress]: '0',
          [DrawerPopupCssVars.swipeStrength]: '1',
        },
      }),
      elementProps,
    ],
    enabled: () => forceRender() || !nested(),
  });
}

export interface DrawerBackdropProps extends BaseUIComponentProps<'div', DrawerBackdropState> {
  /**
   * Whether the backdrop is forced to render even when nested.
   * @default false
   */
  forceRender?: boolean | undefined;
}

export interface DrawerBackdropState {
  /**
   * Whether the drawer is currently open.
   */
  open: boolean;
  /**
   * The transition status of the component.
   */
  transitionStatus: TransitionStatus;
}

export namespace DrawerBackdrop {
  export type Props = DrawerBackdropProps;
  export type State = DrawerBackdropState;
}
