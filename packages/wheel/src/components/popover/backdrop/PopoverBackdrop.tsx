/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import { usePopoverRootContext } from '../root/PopoverRootContext';
import type { BaseUIComponentProps } from '../../internals/types';
import type { StateAttributesMapping } from '../../internals/getStateAttributesProps';
import { popupStateMapping as baseMapping } from '../../utils/popupStateMapping';
import { transitionStatusMapping } from '../../internals/stateAttributesMapping';
import type { TransitionStatus } from '../../internals/createTransitionStatus';
import { renderElement } from '../../internals/renderElement';
import { REASONS } from '../../internals/reasons';

const stateAttributesMapping: StateAttributesMapping<PopoverBackdropState> = {
  ...baseMapping,
  ...transitionStatusMapping,
};

/**
 * An overlay displayed beneath the popover.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Popover](https://base-ui.com/react/components/popover)
 *
 * Deviation: upstream also stashes the rendered element on `store.context.backdropRef`. Nothing
 * else in the ported file set reads that ref (it isn't consulted by the positioner, popup, or any
 * hook in this port's slice), so it's dropped here rather than adding unused plumbing.
 */
export function PopoverBackdrop(componentProps: PopoverBackdrop.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, ['class', 'style', 'as', 'asChild', 'children']);

  const store = usePopoverRootContext();

  const open = store.useState('open');
  const mounted = store.useState('mounted');
  const transitionStatus = store.useState('transitionStatus');
  const openChangeReason = store.useState('openChangeReason');

  const state: PopoverBackdrop.State = {
    get open() {
      return open();
    },
    get transitionStatus() {
      return transitionStatus();
    },
  };

  return renderElement('div', componentProps, {
    defaultClass: 'wheel-Popover-Backdrop',
    slot: 'popover-backdrop',
    state,
    props: [
      () => ({
        role: 'presentation',
        hidden: !mounted(),
        style: {
          'pointer-events': openChangeReason() === REASONS.triggerHover ? 'none' : undefined,
          'user-select': 'none',
          '-webkit-user-select': 'none',
        },
      }),
      elementProps,
    ],
    stateAttributesMapping,
  });
}

export interface PopoverBackdropState {
  /**
   * Whether the popover is currently open.
   */
  open: boolean;
  /**
   * The transition status of the component.
   */
  transitionStatus: TransitionStatus;
}

export interface PopoverBackdropProps extends BaseUIComponentProps<'div', PopoverBackdropState> {}

export namespace PopoverBackdrop {
  export type State = PopoverBackdropState;
  export type Props = PopoverBackdropProps;
}
