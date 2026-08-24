/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import { useTooltipPositionerContext } from '../positioner/TooltipPositionerContext';
import type { BaseUIComponentProps } from '../../internals/types';
import type { Align, Side } from '../../utils/useAnchorPositioning';
import { popupStateMapping } from '../../utils/popupStateMapping';
import { renderElement } from '../../internals/renderElement';
import { useTooltipRootContext } from '../root/TooltipRootContext';

/**
 * Displays an element positioned against the tooltip anchor.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Tooltip](https://base-ui.com/react/components/tooltip)
 */
export function TooltipArrow(componentProps: TooltipArrow.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, ['class', 'style', 'as', 'asChild', 'children']);

  const store = useTooltipRootContext();
  const { setArrowElement, side, align, arrowUncentered, arrowStyles } =
    useTooltipPositionerContext();

  const open = store.useState('open');
  const instantType = store.useState('instantType');

  const state: TooltipArrow.State = {
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
    get instant() {
      return instantType();
    },
  };

  return renderElement('div', componentProps, {
    defaultClass: 'wheel-Tooltip-Arrow',
    slot: 'tooltip-arrow',
    state,
    ref: setArrowElement,
    props: [() => ({ style: arrowStyles(), 'aria-hidden': true }), elementProps],
    stateAttributesMapping: popupStateMapping,
  });
}

export interface TooltipArrowState {
  /**
   * Whether the tooltip is currently open.
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
  /**
   * Whether transitions should be skipped.
   */
  instant: 'delay' | 'dismiss' | 'focus' | undefined;
}

export interface TooltipArrowProps extends BaseUIComponentProps<'div', TooltipArrowState> {}

export namespace TooltipArrow {
  export type State = TooltipArrowState;
  export type Props = TooltipArrowProps;
}
