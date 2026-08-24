/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps } from 'solid-js';
import { renderElement } from '../../internals/renderElement';
import type { BaseUIComponentProps } from '../../internals/types';
import type { RadioRootState } from '../root/RadioRoot';
import { useRadioRootContext } from '../root/RadioRootContext';
import { stateAttributesMapping } from '../utils/stateAttributesMapping';
import { createTransitionStatus, type TransitionStatus } from '../../internals/createTransitionStatus';
import { createOpenChangeComplete } from '../../internals/createOpenChangeComplete';

/**
 * Indicates whether the radio button is selected.
 * Renders a `<span>` element.
 *
 * Documentation: [Base UI Radio](https://base-ui.com/react/components/radio)
 */
export function RadioIndicator(componentProps: RadioIndicator.Props) {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'keepMounted',
  ]);

  const keepMounted = () => componentProps.keepMounted ?? false;

  const rootState = useRadioRootContext();

  const rendered = () => rootState.checked;

  const { mounted, setMounted, transitionStatus } = createTransitionStatus(rendered);

  let indicatorRef: HTMLSpanElement | undefined;

  const state: RadioIndicator.State = {
    get checked() {
      return rootState.checked;
    },
    get disabled() {
      return rootState.disabled;
    },
    get readOnly() {
      return rootState.readOnly;
    },
    get required() {
      return rootState.required;
    },
    get touched() {
      return rootState.touched;
    },
    get dirty() {
      return rootState.dirty;
    },
    get valid() {
      return rootState.valid;
    },
    get filled() {
      return rootState.filled;
    },
    get focused() {
      return rootState.focused;
    },
    get transitionStatus() {
      return transitionStatus();
    },
  };

  createOpenChangeComplete({
    open: rendered,
    getElement: () => indicatorRef ?? null,
    onComplete() {
      if (!rendered()) {
        setMounted(false);
      }
    },
  });

  const shouldRender = () => keepMounted() || mounted();

  return renderElement('span', componentProps, {
    defaultClass: 'wheel-Radio-Indicator',
    slot: 'radio-indicator',
    ref: (el: HTMLSpanElement) => {
      indicatorRef = el;
    },
    state,
    stateAttributesMapping,
    props: [elementProps as Record<string, any>],
    enabled: shouldRender,
  });
}

export interface RadioIndicatorState extends RadioRootState {
  /**
   * The transition status of the component.
   */
  transitionStatus: TransitionStatus;
}

export interface RadioIndicatorProps extends BaseUIComponentProps<'span', RadioIndicatorState> {
  /**
   * Whether to keep the HTML element in the DOM when the radio button is inactive.
   * @default false
   */
  keepMounted?: boolean | undefined;
}

export namespace RadioIndicator {
  export type Props = RadioIndicatorProps;
  export type State = RadioIndicatorState;
}
