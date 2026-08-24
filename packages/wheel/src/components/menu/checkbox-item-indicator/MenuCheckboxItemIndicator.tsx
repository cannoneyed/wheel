/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import { createTransitionStatus } from '../../internals/createTransitionStatus';
import { createOpenChangeComplete } from '../../internals/createOpenChangeComplete';
import { renderElement } from '../../internals/renderElement';
import type { BaseUIComponentProps } from '../../internals/types';
import type { TransitionStatus } from '../../internals/createTransitionStatus';
import { itemMapping } from '../utils/stateAttributesMapping';
import { useMenuCheckboxItemContext } from '../checkbox-item/MenuCheckboxItemContext';

/**
 * Indicates whether the checkbox item is ticked.
 * Renders a `<span>` element.
 *
 * Documentation: [Base UI Menu](https://base-ui.com/react/components/menu)
 */
export function MenuCheckboxItemIndicator(componentProps: MenuCheckboxItemIndicator.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'keepMounted',
  ]);

  const item = useMenuCheckboxItemContext();
  const keepMounted = () => local.keepMounted ?? false;

  const { mounted, setMounted, transitionStatus } = createTransitionStatus(() => item.checked);

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

  const state: MenuCheckboxItemIndicator.State = {
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
    defaultClass: 'wheel-Menu-CheckboxItemIndicator',
    slot: 'menu-checkbox-item-indicator',
    state,
    enabled: () => keepMounted() || item.checked,
    ref: (el: HTMLElement | null) => {
      indicatorElement = el;
    },
    stateAttributesMapping: itemMapping,
    props: [{ 'aria-hidden': true }, elementProps],
  });
}

export interface MenuCheckboxItemIndicatorState {
  /**
   * Whether the item is currently ticked.
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

export interface MenuCheckboxItemIndicatorProps
  extends BaseUIComponentProps<'span', MenuCheckboxItemIndicatorState> {
  /**
   * Whether to keep the indicator mounted in the DOM while the item is unchecked.
   * @default false
   */
  keepMounted?: boolean | undefined;
}

export namespace MenuCheckboxItemIndicator {
  export type State = MenuCheckboxItemIndicatorState;
  export type Props = MenuCheckboxItemIndicatorProps;
}
