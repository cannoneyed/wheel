/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-tracked-show -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
import { Show, splitProps, type JSX } from 'solid-js';
import type { BaseUIComponentProps } from '../../internals/types';
import { useComboboxItemContext } from '../item/ComboboxItemContext';
import { createTransitionStatus, type TransitionStatus } from '../../internals/createTransitionStatus';
import { createOpenChangeComplete } from '../../internals/createOpenChangeComplete';
import { renderElement } from '../../internals/renderElement';
import { transitionStatusMapping } from '../../internals/stateAttributesMapping';

/**
 * Indicates whether the item is selected.
 * Renders a `<span>` element.
 *
 * Documentation: [Base UI Combobox](https://base-ui.com/react/components/combobox)
 */
export function ComboboxItemIndicator(componentProps: ComboboxItemIndicator.Props): JSX.Element {
  const { selected } = useComboboxItemContext();
  const keepMounted = () => componentProps.keepMounted ?? false;

  return (
    <Show when={keepMounted() || selected()}>
      <ComboboxItemIndicatorInner {...componentProps} />
    </Show>
  );
}

// Split the core implementation to avoid paying the setup cost unless the element needs to mount.
function ComboboxItemIndicatorInner(componentProps: ComboboxItemIndicator.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'keepMounted',
  ]);

  const { selected } = useComboboxItemContext();

  let indicatorEl: HTMLElement | null = null;

  const { transitionStatus, setMounted } = createTransitionStatus(selected);

  const state: ComboboxItemIndicator.State = {
    get selected() {
      return selected();
    },
    get transitionStatus() {
      return transitionStatus();
    },
  };

  const element = renderElement('span', componentProps, {
    defaultClass: 'wheel-Combobox-ItemIndicator',
    slot: 'combobox-item-indicator',
    ref: (el: HTMLSpanElement | null) => {
      indicatorEl = el;
    },
    state,
    props: [{ 'aria-hidden': true }, elementProps],
    children: () => '✔️',
    stateAttributesMapping: transitionStatusMapping,
  });

  createOpenChangeComplete({
    open: selected,
    getElement: () => indicatorEl,
    onComplete() {
      if (!selected()) {
        setMounted(false);
      }
    },
  });

  return element;
}

export interface ComboboxItemIndicatorProps
  extends BaseUIComponentProps<'span', ComboboxItemIndicatorState> {
  children?: JSX.Element;
  /**
   * Whether to keep the HTML element in the DOM when the item is not selected.
   * @default false
   */
  keepMounted?: boolean | undefined;
}

export interface ComboboxItemIndicatorState {
  /**
   * Whether the item is selected.
   */
  selected: boolean;
  /**
   * The transition status of the component.
   */
  transitionStatus: TransitionStatus;
}

export namespace ComboboxItemIndicator {
  export type Props = ComboboxItemIndicatorProps;
  export type State = ComboboxItemIndicatorState;
}
