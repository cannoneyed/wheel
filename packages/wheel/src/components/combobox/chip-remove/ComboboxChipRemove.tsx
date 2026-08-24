/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import type { BaseUIComponentProps, NativeButtonProps } from '../../internals/types';
import { useComboboxRootContext } from '../root/ComboboxRootContext';
import { useComboboxChipContext } from '../chip/ComboboxChipContext';
import { createButton } from '../../internals/use-button/createButton';
import { stopEvent } from '../../floating-ui-solid';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import { findItemIndex } from '../../internals/itemEquality';
import { renderElement } from '../../internals/renderElement';

/**
 * A button to remove a chip.
 * Renders a `<button>` element.
 *
 * Documentation: [Base UI Combobox](https://base-ui.com/react/components/combobox)
 */
export function ComboboxChipRemove(componentProps: ComboboxChipRemove.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'disabled',
    'nativeButton',
  ]);

  const store = useComboboxRootContext();
  const { index } = useComboboxChipContext();

  const comboboxDisabled = store.useState('disabled');
  const readOnly = store.useState('readOnly');
  const selectedValue = store.useState('selectedValue');
  const isItemEqualToValue = store.useState('isItemEqualToValue');

  const disabled = () => (comboboxDisabled() || local.disabled) ?? false;
  const nativeButton = () => local.nativeButton ?? true;

  const { getButtonProps, buttonRef } = createButton({
    native: nativeButton,
    disabled: () => disabled() || readOnly(),
    focusableWhenDisabled: () => true,
  });

  const state: ComboboxChipRemove.State = {
    get disabled() {
      return disabled();
    },
  };

  function clearActiveIndexForRemovedItem(removedItem: any) {
    const activeIndex = store.state.activeIndex;

    if (activeIndex == null) {
      return;
    }

    const removedIndex = findItemIndex(
      store.context.valuesRef.current,
      removedItem,
      isItemEqualToValue(),
    );
    if (removedIndex !== -1 && activeIndex === removedIndex) {
      store.context.setIndices({
        activeIndex: null,
        type: store.context.keyboardActiveRef.current ? 'keyboard' : 'pointer',
      });
    }
  }

  function removeChip(event: MouseEvent | KeyboardEvent) {
    const eventDetails = createChangeEventDetails(REASONS.chipRemovePress, event);
    const currentSelectedValue: any[] = selectedValue();
    const removedItem = currentSelectedValue[index()];

    clearActiveIndexForRemovedItem(removedItem);

    store.context.setSelectedValue(
      currentSelectedValue.filter((_, i) => i !== index()),
      eventDetails,
    );

    store.context.inputRef.current?.focus();
    return eventDetails;
  }

  const element = renderElement('button', componentProps, {
    defaultClass: 'wheel-Combobox-ChipRemove',
    slot: 'combobox-chip-remove',
    state,
    ref: buttonRef,
    props: [
      {
        tabIndex: -1,
        onMouseDown(event: MouseEvent) {
          event.preventDefault();
        },
        onClick(event: MouseEvent) {
          if (disabled() || readOnly()) {
            return;
          }

          const eventDetails = removeChip(event);
          if (!eventDetails.isPropagationAllowed) {
            event.stopPropagation();
          }
        },
        onKeyDown(event: KeyboardEvent) {
          if (disabled() || readOnly()) {
            return;
          }

          if (event.key === 'Enter' || event.key === ' ') {
            const eventDetails = removeChip(event);
            if (!eventDetails.isPropagationAllowed) {
              stopEvent(event);
            }
          }
        },
      },
      elementProps,
      getButtonProps,
    ],
  });

  return element;
}

export interface ComboboxChipRemoveState {
  /**
   * Whether the component should ignore user interaction.
   */
  disabled: boolean;
}

export interface ComboboxChipRemoveProps
  extends NativeButtonProps,
    BaseUIComponentProps<'button', ComboboxChipRemoveState> {}

export namespace ComboboxChipRemove {
  export type State = ComboboxChipRemoveState;
  export type Props = ComboboxChipRemoveProps;
}
