/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import { useComboboxPositionerContext } from '../positioner/ComboboxPositionerContext';
import { useComboboxRootContext } from '../root/ComboboxRootContext';
import { popupStateMapping } from '../../utils/popupStateMapping';
import { renderElement } from '../../internals/renderElement';
import type { Align, Side } from '../../utils/useAnchorPositioning';
import type { BaseUIComponentProps } from '../../internals/types';

/**
 * Displays an element positioned against the anchor.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Combobox](https://base-ui.com/react/components/combobox)
 */
export function ComboboxArrow(componentProps: ComboboxArrow.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, ['class', 'style', 'as', 'asChild', 'children']);

  const store = useComboboxRootContext();
  const { setArrowElement, side, align, arrowUncentered, arrowStyles } = useComboboxPositionerContext();

  const open = store.useState('open');

  const state: ComboboxArrow.State = {
    get open() {
      return open();
    },
    get side() {
      return side();
    },
    get align() {
      return align();
    },
    get uncentered() {
      return arrowUncentered();
    },
  };

  return renderElement('div', componentProps, {
    defaultClass: 'wheel-Combobox-Arrow',
    slot: 'combobox-arrow',
    ref: (el: Element | null) => setArrowElement(el),
    stateAttributesMapping: popupStateMapping,
    state,
    props: [() => ({ style: arrowStyles(), 'aria-hidden': true }), elementProps],
  });
}

export interface ComboboxArrowState {
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
   * Whether the arrow cannot be centered on the anchor.
   */
  uncentered: boolean;
}

export interface ComboboxArrowProps extends BaseUIComponentProps<'div', ComboboxArrowState> {}

export namespace ComboboxArrow {
  export type State = ComboboxArrowState;
  export type Props = ComboboxArrowProps;
}
