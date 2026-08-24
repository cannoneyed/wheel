/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import type { BaseUIComponentProps } from '../../internals/types';
import { useComboboxChipsContext } from '../chips/ComboboxChipsContext';
import { useComboboxRootContext } from '../root/ComboboxRootContext';
import { createCompositeListItem } from '../../internals/composite/list/createCompositeListItem';
import { ComboboxChipContext } from './ComboboxChipContext';
import { stopEvent } from '../../floating-ui-solid';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import { useDirection } from '../../internals/direction-context/DirectionContext';
import { renderElement } from '../../internals/renderElement';

/**
 * An individual chip that represents a value in a multiselectable input.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Combobox](https://base-ui.com/react/components/combobox)
 */
export function ComboboxChip(componentProps: ComboboxChip.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, ['class', 'style', 'as', 'asChild', 'children']);

  const store = useComboboxRootContext();
  const chipsContext = useComboboxChipsContext();
  const direction = useDirection();

  const disabled = store.useState('disabled');
  const readOnly = store.useState('readOnly');
  const selectedValue = store.useState('selectedValue');

  const { ref, index } = createCompositeListItem<unknown>();

  function handleKeyDown(event: KeyboardEvent): number | undefined {
    let nextIndex: number | undefined = index();
    const isRtl = direction() === 'rtl';
    const previousChipKey = isRtl ? 'ArrowRight' : 'ArrowLeft';
    const nextChipKey = isRtl ? 'ArrowLeft' : 'ArrowRight';
    const currentSelectedValue: any[] = Array.isArray(selectedValue()) ? selectedValue() : [];
    const chipsRef = chipsContext?.chipsRef ?? { current: [] };

    if (event.key === previousChipKey) {
      event.preventDefault();
      nextIndex = index() > 0 ? index() - 1 : undefined;
    } else if (event.key === nextChipKey) {
      event.preventDefault();
      nextIndex = index() < chipsRef.current.length - 1 ? index() + 1 : undefined;
    } else if (event.key === 'Backspace' || event.key === 'Delete') {
      const computedNextIndex =
        index() >= currentSelectedValue.length - 1 ? currentSelectedValue.length - 2 : index();
      nextIndex = computedNextIndex >= 0 ? computedNextIndex : undefined;

      stopEvent(event);

      store.context.setIndices({ activeIndex: null, selectedIndex: null, type: 'keyboard' });
      store.context.setSelectedValue(
        currentSelectedValue.filter((_, i) => i !== index()),
        createChangeEventDetails(REASONS.none, event),
      );
    } else if (event.key === 'Enter' || event.key === ' ') {
      stopEvent(event);
      nextIndex = undefined;
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      stopEvent(event);
      store.context.setOpen(true, createChangeEventDetails(REASONS.listNavigation, event));
      nextIndex = undefined;
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      nextIndex = undefined;
    }

    return nextIndex;
  }

  const state: ComboboxChip.State = {
    get disabled() {
      return disabled();
    },
  };

  const contextValue: ComboboxChipContext = { index };

  // Inlined `renderElement(...)` call: it must be created *inside* the Provider's JSX so
  // `componentProps.children` (which may include `<Combobox.ChipRemove>`) is created after the
  // context exists — see CONVENTIONS.md's "Context is resolved at CREATION time in Solid".
  return (
    <ComboboxChipContext.Provider value={contextValue}>
      {renderElement('div', componentProps, {
        defaultClass: 'wheel-Combobox-Chip',
        slot: 'combobox-chip',
        ref,
        state,
        props: [
          () => ({
            tabIndex: -1,
            'aria-disabled': disabled() || undefined,
            'aria-readonly': readOnly() || undefined,
            onKeyDown(event: KeyboardEvent) {
              if (disabled() || readOnly()) {
                return;
              }

              const nextIndex = handleKeyDown(event);

              chipsContext?.setHighlightedChipIndex(nextIndex);

              if (nextIndex === undefined) {
                store.context.inputRef.current?.focus();
              } else {
                chipsContext?.chipsRef.current[nextIndex]?.focus();
              }
            },
          }),
          elementProps,
        ],
      })}
    </ComboboxChipContext.Provider>
  );
}

export interface ComboboxChipState {
  /**
   * Whether the component should ignore user interaction.
   */
  disabled: boolean;
}

export interface ComboboxChipProps extends BaseUIComponentProps<'div', ComboboxChipState> {}

export namespace ComboboxChip {
  export type State = ComboboxChipState;
  export type Props = ComboboxChipProps;
}
