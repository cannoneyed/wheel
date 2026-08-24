/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import { usePreviewCardPositionerContext } from '../positioner/PreviewCardPositionerContext';
import { usePreviewCardRootContext } from '../root/PreviewCardContext';
import type { BaseUIComponentProps } from '../../internals/types';
import type { Align, Side } from '../../utils/useAnchorPositioning';
import { popupStateMapping } from '../../utils/popupStateMapping';
import { renderElement } from '../../internals/renderElement';

/**
 * Displays an element positioned against the preview card anchor.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Preview Card](https://base-ui.com/react/components/preview-card)
 */
export function PreviewCardArrow(componentProps: PreviewCardArrow.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, ['class', 'style', 'as', 'asChild', 'children']);

  const store = usePreviewCardRootContext();
  const { setArrowElement, side, align, arrowUncentered, arrowStyles } =
    usePreviewCardPositionerContext();

  const open = store.useState('open');

  const state: PreviewCardArrow.State = {
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
    defaultClass: 'wheel-PreviewCard-Arrow',
    slot: 'preview-card-arrow',
    state,
    ref: setArrowElement,
    props: [() => ({ style: arrowStyles(), 'aria-hidden': true }), elementProps],
    stateAttributesMapping: popupStateMapping,
  });
}

export interface PreviewCardArrowState {
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
   * Whether the arrow cannot be centered on the anchor.
   */
  uncentered: boolean;
}

export interface PreviewCardArrowProps extends BaseUIComponentProps<'div', PreviewCardArrowState> {}

export namespace PreviewCardArrow {
  export type State = PreviewCardArrowState;
  export type Props = PreviewCardArrowProps;
}
