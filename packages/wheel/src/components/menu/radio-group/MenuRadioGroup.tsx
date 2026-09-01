/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { useSignal } from '../../../core/local-state';
import { splitProps, type JSX } from 'solid-js';
import { createControllableSignal } from '../../base-utils/createControllableSignal';
import { renderElement } from '../../internals/renderElement';
import type { BaseUIComponentProps } from '../../internals/types';
import type { MenuRoot } from '../root/MenuRoot';
import { MenuGroupContext } from '../group/MenuGroupContext';
import { MenuRadioGroupContext } from './MenuRadioGroupContext';

/**
 * Groups related radio items.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Menu](https://base-ui.com/react/components/menu)
 */
export function MenuRadioGroup(componentProps: MenuRadioGroup.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'value',
    'defaultValue',
    'onValueChange',
    'disabled',
    'aria-labelledby',
  ]);

  const [labelId, setLabelId] = useSignal<string | undefined>(undefined, 'labelId');
  const disabled = () => local.disabled ?? false;

  const [value, setValueUnwrapped] = createControllableSignal<any>({
    controlled: () => local.value,
    default: local.defaultValue,
    name: 'MenuRadioGroup',
  });

  function setValue(newValue: any, eventDetails: MenuRoot.ChangeEventDetails) {
    local.onValueChange?.(newValue, eventDetails);
    if (eventDetails.isCanceled) {
      return;
    }
    setValueUnwrapped(newValue);
  }

  const radioGroupContext: MenuRadioGroupContext = {
    get value() {
      return value();
    },
    setValue,
    get disabled() {
      return disabled();
    },
  };

  const state: MenuRadioGroup.State = {
    get disabled() {
      return disabled();
    },
  };

  return (
    <MenuGroupContext.Provider value={setLabelId}>
      <MenuRadioGroupContext.Provider value={radioGroupContext}>
        {renderElement('div', componentProps, {
          defaultClass: 'wheel-Menu-RadioGroup',
          slot: 'menu-radio-group',
          state,
          props: [
            () => ({
              role: 'group' as const,
              'aria-labelledby': local['aria-labelledby'] ?? labelId(),
              'aria-disabled': disabled() || undefined,
            }),
            elementProps,
          ],
        })}
      </MenuRadioGroupContext.Provider>
    </MenuGroupContext.Provider>
  );
}

export interface MenuRadioGroupState {
  /**
   * Whether the component should ignore user interaction.
   */
  disabled: boolean;
}

export interface MenuRadioGroupProps extends BaseUIComponentProps<'div', MenuRadioGroupState> {
  /**
   * The controlled value of the radio item that should be currently selected.
   */
  value?: any;
  /**
   * The uncontrolled value of the radio item that should be initially selected.
   */
  defaultValue?: any;
  /**
   * Event handler called when the selected value changes.
   */
  onValueChange?: ((value: any, eventDetails: MenuRoot.ChangeEventDetails) => void) | undefined;
  /**
   * Whether the component should ignore user interaction.
   * @default false
   */
  disabled?: boolean | undefined;
}

export namespace MenuRadioGroup {
  export type State = MenuRadioGroupState;
  export type Props = MenuRadioGroupProps;
}
