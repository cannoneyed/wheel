/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import { useTooltipRootContext } from '../root/TooltipRootContext';
import { useTooltipPositionerContext } from '../positioner/TooltipPositionerContext';
import type { BaseUIComponentProps } from '../../internals/types';
import type { Align, Side } from '../../utils/useAnchorPositioning';
import { createOpenChangeComplete } from '../../internals/createOpenChangeComplete';
import type { TransitionStatus } from '../../internals/createTransitionStatus';
import { renderElement } from '../../internals/renderElement';
import { getDisabledMountTransitionStyles } from '../../utils/getDisabledMountTransitionStyles';
import { useHoverFloatingInteraction } from '../../floating-ui-solid';
import { tooltipPopupStateAttributesMapping } from './stateAttributesMapping';

/**
 * A container for the tooltip contents.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Tooltip](https://base-ui.com/react/components/tooltip)
 */
export function TooltipPopup(componentProps: TooltipPopup.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, ['class', 'style', 'as', 'asChild', 'children']);

  const store = useTooltipRootContext();
  const positioner = useTooltipPositionerContext();

  const open = store.useState('open');
  const instantType = store.useState('instantType');
  const transitionStatus = store.useState('transitionStatus');
  const popupProps = store.useState('popupProps');
  const disabled = store.useState('disabled');
  const closeDelay = store.useState('closeDelay');

  let popupElement: HTMLElement | null = null;

  createOpenChangeComplete({
    open,
    getElement: () => popupElement,
    onComplete() {
      if (open()) {
        store.context.onOpenChangeComplete?.(true);
      }
    },
  });

  useHoverFloatingInteraction(store.state.floatingRootContext, {
    enabled: () => !disabled(),
    closeDelay,
  });

  const state: TooltipPopup.State = {
    get open() {
      return open();
    },
    get side() {
      return positioner.side();
    },
    get align() {
      return positioner.align();
    },
    get instant() {
      return instantType();
    },
    get transitionStatus() {
      return transitionStatus();
    },
  };

  return renderElement('div', componentProps, {
    defaultClass: 'wheel-Tooltip-Popup',
    slot: 'tooltip-popup',
    state,
    ref: (el: HTMLElement | null) => {
      popupElement = el;
      store.set('popupElement', el);
    },
    props: [popupProps, () => getDisabledMountTransitionStyles(transitionStatus()), elementProps],
    stateAttributesMapping: tooltipPopupStateAttributesMapping,
  });
}

export interface TooltipPopupState {
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
   * Whether transitions should be skipped.
   */
  instant: 'delay' | 'focus' | 'dismiss' | undefined;
  /**
   * The transition status of the component.
   */
  transitionStatus: TransitionStatus;
}

export interface TooltipPopupProps extends BaseUIComponentProps<'div', TooltipPopupState> {}

export namespace TooltipPopup {
  export type State = TooltipPopupState;
  export type Props = TooltipPopupProps;
}
