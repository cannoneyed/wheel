/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import { ownerDocument } from '../../base-utils/owner';
import { focusElementWithVisible, useLabel } from '../../internals/labelable-provider/useLabel';
import type { BaseUIComponentProps } from '../../internals/types';
import { renderElement } from '../../internals/renderElement';
import type { SliderRoot } from '../root/SliderRoot';
import { useSliderRootContext } from '../root/SliderRootContext';
import { sliderStateAttributesMapping } from '../root/stateAttributesMapping';

/**
 * An accessible label that is automatically associated with the slider thumbs.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Slider](https://base-ui.com/react/components/slider)
 */
export function SliderLabel(componentProps: SliderLabel.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, ['class', 'style', 'as', 'asChild', 'children']);

  const { state, setLabelId, controlRef, rootLabelId } = useSliderRootContext();

  function focusControl(event: MouseEvent, controlId: string | null | undefined) {
    if (controlId) {
      const controlElement = ownerDocument(event.currentTarget as Element).getElementById(controlId);
      if (controlElement instanceof HTMLElement) {
        focusElementWithVisible(controlElement);
        return;
      }
    }

    const fallbackInputs = controlRef.current?.querySelectorAll('input[type="range"]');
    const fallbackInput = fallbackInputs && fallbackInputs.length === 1 ? fallbackInputs[0] : null;
    if (fallbackInput instanceof HTMLElement) {
      focusElementWithVisible(fallbackInput);
    }
  }

  const labelProps = useLabel({
    id: rootLabelId,
    setLabelId,
    focusControl,
  });

  return renderElement('div', componentProps, {
    defaultClass: 'wheel-Slider-Label',
    slot: 'slider-label',
    state,
    props: [labelProps, elementProps],
    stateAttributesMapping: sliderStateAttributesMapping,
  });
}

export type SliderLabelState = SliderRoot.State;

export interface SliderLabelProps
  extends Omit<BaseUIComponentProps<'div', SliderLabelState>, 'id'> {}

export namespace SliderLabel {
  export type State = SliderLabelState;
  export type Props = SliderLabelProps;
}
