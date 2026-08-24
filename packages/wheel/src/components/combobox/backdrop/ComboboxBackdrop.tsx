/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import type { BaseUIComponentProps } from '../../internals/types';
import { useComboboxRootContext } from '../root/ComboboxRootContext';
import { popupStateMapping } from '../../utils/popupStateMapping';
import type { StateAttributesMapping } from '../../internals/getStateAttributesProps';
import type { TransitionStatus } from '../../internals/createTransitionStatus';
import { transitionStatusMapping } from '../../internals/stateAttributesMapping';
import { renderElement } from '../../internals/renderElement';

const stateAttributesMapping: StateAttributesMapping<ComboboxBackdropState> = {
  ...popupStateMapping,
  ...transitionStatusMapping,
};

/**
 * An overlay displayed beneath the popup.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Combobox](https://base-ui.com/react/components/combobox)
 */
export function ComboboxBackdrop(componentProps: ComboboxBackdrop.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, ['class', 'style', 'as', 'asChild', 'children']);

  const store = useComboboxRootContext();

  const open = store.useState('open');
  const mounted = store.useState('mounted');
  const transitionStatus = store.useState('transitionStatus');

  const state: ComboboxBackdrop.State = {
    get open() {
      return open();
    },
    get transitionStatus() {
      return transitionStatus();
    },
  };

  return renderElement('div', componentProps, {
    defaultClass: 'wheel-Combobox-Backdrop',
    slot: 'combobox-backdrop',
    state,
    props: [
      // Reactive thunk (not a plain object): `hidden` must update when `mounted` flips after
      // setup, and only zero-arg functions in `renderElement`'s `props` array are re-evaluated —
      // see CONVENTIONS.md.
      () => ({
        role: 'presentation',
        hidden: !mounted(),
        style: {
          'user-select': 'none',
          '-webkit-user-select': 'none',
        },
      }),
      elementProps,
    ],
    stateAttributesMapping,
  });
}

export interface ComboboxBackdropProps extends BaseUIComponentProps<'div', ComboboxBackdropState> {}

export interface ComboboxBackdropState {
  /**
   * Whether the popup is currently open.
   */
  open: boolean;
  /**
   * The transition status of the component.
   */
  transitionStatus: TransitionStatus;
}

export namespace ComboboxBackdrop {
  export type Props = ComboboxBackdropProps;
  export type State = ComboboxBackdropState;
}
