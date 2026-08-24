/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import { createTransitionStatus, type TransitionStatus } from '../../internals/createTransitionStatus';
import { createOpenChangeComplete } from '../../internals/createOpenChangeComplete';
import { renderElement } from '../../internals/renderElement';
import type { BaseUIComponentProps } from '../../internals/types';
import { itemMapping } from '../utils/stateAttributesMapping';
import { useMenuRadioItemContext } from '../radio-item/MenuRadioItemContext';

/**
 * Indicates whether the radio item is selected.
 * Renders a `<span>` element.
 *
 * Documentation: [Base UI Menu](https://base-ui.com/react/components/menu)
 */
export function MenuRadioItemIndicator(componentProps: MenuRadioItemIndicator.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'keepMounted',
  ]);

  const item = useMenuRadioItemContext();
  const keepMounted = () => local.keepMounted ?? false;

  const { setMounted, transitionStatus } = createTransitionStatus(() => item.checked);

  let indicatorElement: HTMLElement | null = null;

  createOpenChangeComplete({
    open: () => item.checked,
    getElement: () => indicatorElement,
    onComplete() {
      if (!item.checked) {
        setMounted(false);
      }
    },
  });

  const state: MenuRadioItemIndicator.State = {
    get checked() {
      return item.checked;
    },
    get disabled() {
      return item.disabled;
    },
    get highlighted() {
      return item.highlighted;
    },
    get transitionStatus() {
      return transitionStatus();
    },
  };

  return renderElement('span', componentProps, {
    defaultClass: 'wheel-Menu-RadioItemIndicator',
    slot: 'menu-radio-item-indicator',
    state,
    enabled: () => keepMounted() || item.checked,
    ref: (el: HTMLElement | null) => {
      indicatorElement = el;
    },
    stateAttributesMapping: itemMapping,
    props: [{ 'aria-hidden': true }, elementProps],
  });
}

export interface MenuRadioItemIndicatorState {
  /**
   * Whether the item is currently selected.
   */
  checked: boolean;
  /**
   * Whether the item is disabled.
   */
  disabled: boolean;
  /**
   * Whether the item is highlighted.
   */
  highlighted: boolean;
  /**
   * The transition status of the indicator.
   */
  transitionStatus: TransitionStatus;
}

export interface MenuRadioItemIndicatorProps
  extends BaseUIComponentProps<'span', MenuRadioItemIndicatorState> {
  /**
   * Whether to keep the indicator mounted in the DOM while the item is unselected.
   * @default false
   */
  keepMounted?: boolean | undefined;
}

export namespace MenuRadioItemIndicator {
  export type State = MenuRadioItemIndicatorState;
  export type Props = MenuRadioItemIndicatorProps;
}
