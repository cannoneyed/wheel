/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import { usePreviewCardRootContext } from '../root/PreviewCardContext';
import { usePreviewCardPositionerContext } from '../positioner/PreviewCardPositionerContext';
import type { Align, Side } from '../../utils/useAnchorPositioning';
import type { BaseUIComponentProps } from '../../internals/types';
import type { TransitionStatus } from '../../internals/createTransitionStatus';
import { createOpenChangeComplete } from '../../internals/createOpenChangeComplete';
import { renderElement } from '../../internals/renderElement';
import { getDisabledMountTransitionStyles } from '../../utils/getDisabledMountTransitionStyles';
import { useHoverFloatingInteraction } from '../../floating-ui-solid';
import { previewCardPopupStateAttributesMapping } from './stateAttributesMapping';

/**
 * A container for the preview card contents.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Preview Card](https://base-ui.com/react/components/preview-card)
 */
export function PreviewCardPopup(componentProps: PreviewCardPopup.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, ['class', 'style', 'as', 'asChild', 'children']);

  const store = usePreviewCardRootContext();
  const positioner = usePreviewCardPositionerContext();

  const open = store.useState('open');
  const instantType = store.useState('instantType');
  const transitionStatus = store.useState('transitionStatus');
  const popupProps = store.useState('popupProps');
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

  useHoverFloatingInteraction(store.state.floatingRootContext, { closeDelay });

  const state: PreviewCardPopup.State = {
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
    defaultClass: 'wheel-PreviewCard-Popup',
    slot: 'preview-card-popup',
    state,
    ref: (el: HTMLElement | null) => {
      popupElement = el;
      store.set('popupElement', el);
    },
    props: [popupProps, () => getDisabledMountTransitionStyles(transitionStatus()), elementProps],
    stateAttributesMapping: previewCardPopupStateAttributesMapping,
  });
}

export interface PreviewCardPopupState {
  /**
   * Whether the preview card is currently open.
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
  instant: 'dismiss' | 'focus' | undefined;
  /**
   * The transition status of the component.
   */
  transitionStatus: TransitionStatus;
}

export interface PreviewCardPopupProps extends BaseUIComponentProps<'div', PreviewCardPopupState> {}

export namespace PreviewCardPopup {
  export type State = PreviewCardPopupState;
  export type Props = PreviewCardPopupProps;
}
