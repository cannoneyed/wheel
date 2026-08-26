/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps } from 'solid-js';
import { useCheckboxRootContext } from '../root/CheckboxRootContext';
import { renderElement } from '../../internals/renderElement';
import type { BaseUIComponentProps } from '../../internals/types';
import type { CheckboxRootState } from '../root/CheckboxRoot';
import { createTransitionStatus, type TransitionStatus } from '../../internals/createTransitionStatus';
import { createOpenChangeComplete } from '../../internals/createOpenChangeComplete';
import { transitionStatusMapping } from '../../internals/stateAttributesMapping';
import { checkboxStateAttributesMapping } from '../utils/stateAttributesMapping';
import type { StateAttributesMapping } from '../../internals/getStateAttributesProps';

/**
 * Indicates whether the checkbox is ticked.
 * Renders a `<span>` element.
 *
 * Documentation: [Base UI Checkbox](https://base-ui.com/react/components/checkbox)
 */
export function CheckboxIndicator(componentProps: CheckboxIndicator.Props) {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'keepMounted',
  ]);

  const keepMounted = () => componentProps.keepMounted ?? false;

  const rootState = useCheckboxRootContext();

  const rendered = () => rootState.checked || rootState.indeterminate;

  const { mounted, setMounted, transitionStatus } = createTransitionStatus(rendered);

  let indicatorRef: HTMLSpanElement | undefined;

  const state: CheckboxIndicator.State = {
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
    get indeterminate() {
      return rootState.indeterminate;
    },
    get size() {
      return rootState.size;
    },
    get status() {
      return rootState.status;
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

  const baseStateAttributesMapping = checkboxStateAttributesMapping(rootState);

  const stateAttributesMapping: StateAttributesMapping<CheckboxIndicator.State> = {
    ...baseStateAttributesMapping,
    ...transitionStatusMapping,
  };

  const shouldRender = () => keepMounted() || mounted();

  return renderElement('span', componentProps, {
    defaultClass: 'wheel-Checkbox-Indicator',
    slot: 'checkbox-indicator',
    ref: (el: HTMLSpanElement) => {
      indicatorRef = el;
    },
    state,
    stateAttributesMapping,
    props: [elementProps as Record<string, any>],
    enabled: shouldRender,
  });
}

export interface CheckboxIndicatorState extends CheckboxRootState {
  /**
   * The transition status of the component.
   */
  transitionStatus: TransitionStatus;
}

export interface CheckboxIndicatorProps
  extends BaseUIComponentProps<'span', CheckboxIndicatorState> {
  /**
   * Whether to keep the element in the DOM when the checkbox is not checked.
   * @default false
   */
  keepMounted?: boolean | undefined;
}

export namespace CheckboxIndicator {
  export type State = CheckboxIndicatorState;
  export type Props = CheckboxIndicatorProps;
}
