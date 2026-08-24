/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createEffect, onCleanup, splitProps, type JSX } from 'solid-js';
import { useSelectRootContext } from '../root/SelectRootContext';
import {
  createCompositeListItem,
  IndexGuessBehavior,
} from '../../internals/composite/list/createCompositeListItem';
import type { BaseUIComponentProps, HTMLProps, NonNativeButtonProps } from '../../internals/types';
import { renderElement } from '../../internals/renderElement';
import { SelectItemContext } from './SelectItemContext';
import { createButton } from '../../internals/use-button/createButton';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import { compareItemEquality, removeItem } from '../../internals/itemEquality';
import { isVirtualClick } from '../../floating-ui-solid';

/**
 * An individual option in the select popup.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Select](https://base-ui.com/react/components/select)
 */
export function SelectItem(componentProps: SelectItem.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'value',
    'label',
    'disabled',
    'nativeButton',
  ]);

  const itemValue = () => local.value ?? null;
  const disabled = () => local.disabled ?? false;
  const nativeButton = () => local.nativeButton ?? false;

  const textRefBox: { current: HTMLElement | null } = { current: null };
  const listItem = createCompositeListItem<unknown>({
    label: () => local.label,
    textRef: () => textRefBox.current,
    indexGuessBehavior: IndexGuessBehavior.GuessFromOrder,
  });

  const {
    store,
    itemProps,
    setOpen,
    setValue,
    selectionRef,
    typingRef,
    valuesRef,
    multiple,
    selectedItemTextRef,
    disabled: selectDisabled,
    readOnly,
  } = useSelectRootContext();

  const index = listItem.index;
  const highlighted = store.useState('isActive', index);
  const open = store.useState('open');
  const selected = store.useState('isSelected', itemValue);
  const selectedByFocus = store.useState('isSelectedByFocus', index);
  const isItemEqualToValue = store.useState('isItemEqualToValue');

  const hasRegistered = () => index() !== -1;

  let itemRef: HTMLElement | null = null;

  createEffect(() => {
    if (!hasRegistered()) {
      return;
    }

    const currentIndex = index();
    const values = valuesRef.current;
    values[currentIndex] = itemValue();

    onCleanup(() => {
      delete values[currentIndex];
    });
  });

  createEffect(() => {
    if (!hasRegistered()) {
      return;
    }

    const currentIndex = index();
    const selectedValue = store.state.value;
    const comparer = isItemEqualToValue();

    let selectedCandidate = selectedValue;
    if (multiple() && Array.isArray(selectedValue)) {
      selectedCandidate = selectedValue.length > 0 ? selectedValue[selectedValue.length - 1] : undefined;
    }

    if (selectedCandidate !== undefined && compareItemEquality(itemValue(), selectedCandidate, comparer)) {
      store.set('selectedIndex', currentIndex);
      // Make sure SelectPopup can measure the selected item on first open.
      if (textRefBox.current) {
        selectedItemTextRef.current = textRefBox.current;
      }
    }
  });

  let lastKey: string | null = null;
  let pointerType: 'mouse' | 'touch' | 'pen' = 'mouse';
  let allowMouseSelection = false;

  const { getButtonProps, buttonRef } = createButton({
    disabled,
    focusableWhenDisabled: () => true,
    native: nativeButton,
    composite: () => true,
  });

  const state: SelectItem.State = {
    get disabled() {
      return disabled();
    },
    get selected() {
      return selected();
    },
    get highlighted() {
      return highlighted();
    },
  };

  function commitSelection(event: MouseEvent | KeyboardEvent | PointerEvent) {
    // A forced-open select (`open`/`defaultOpen`) can still receive item activations even
    // when the root is disabled or read-only, so guard the commit here too.
    if (selectDisabled() || readOnly()) {
      return;
    }

    const selectedValue = store.state.value;
    const comparer = isItemEqualToValue();
    if (multiple()) {
      const currentValue = Array.isArray(selectedValue) ? selectedValue : [];
      const nextValue = selected()
        ? removeItem(currentValue, itemValue(), comparer)
        : [...currentValue, itemValue()];
      setValue(nextValue, createChangeEventDetails(REASONS.itemPress, event));
    } else {
      setValue(itemValue(), createChangeEventDetails(REASONS.itemPress, event));
      setOpen(false, createChangeEventDetails(REASONS.itemPress, event));
    }
  }

  function resetDragMovement() {
    selectionRef.current.dragY = 0;
  }

  const defaultProps = (): HTMLProps => ({
    role: 'option',
    'aria-selected': selected(),
    tabIndex: open() && highlighted() ? 0 : -1,
    onKeyDown(event: KeyboardEvent) {
      lastKey = event.key;
      store.set('activeIndex', index());

      if (event.key === ' ' && typingRef.current) {
        event.preventDefault();
      }
    },
    onClick(event: MouseEvent) {
      const isMouseClick = event.type === 'click' && pointerType !== 'touch';
      const clickPointerType = (event as PointerEvent).pointerType;
      const isVirtualMouseClick =
        isMouseClick &&
        isVirtualClick(event) &&
        (clickPointerType !== undefined || highlighted());
      const isInvalidMouseClick = isMouseClick && !isVirtualMouseClick && !allowMouseSelection;

      allowMouseSelection = false;

      // Prevent double commit on {Enter}
      if (event.type === 'keydown' && lastKey === null) {
        return;
      }

      if (
        disabled() ||
        (event.type === 'keydown' && lastKey === ' ' && typingRef.current) ||
        isInvalidMouseClick
      ) {
        return;
      }

      lastKey = null;
      commitSelection(event);
    },
    onPointerEnter(event: PointerEvent) {
      pointerType = event.pointerType as 'mouse' | 'touch' | 'pen';
    },
    onPointerMove(event: PointerEvent) {
      if (event.pointerType === 'mouse' && event.buttons === 1) {
        const selection = selectionRef.current;
        selection.dragY += event.movementY;

        if (selection.dragY ** 2 >= 64) {
          selection.allowUnselectedMouseUp = true;
        }
      }
    },
    onPointerDown(event: PointerEvent) {
      pointerType = event.pointerType as 'mouse' | 'touch' | 'pen';
      allowMouseSelection = true;
      resetDragMovement();
    },
    onMouseUp() {
      resetDragMovement();

      if (disabled() || pointerType === 'touch') {
        return;
      }

      // Regular clicks are committed by the click event.
      if (allowMouseSelection) {
        return;
      }

      const disallowSelectedMouseUp = !selectionRef.current.allowSelectedMouseUp && selected();
      const disallowUnselectedMouseUp = !selectionRef.current.allowUnselectedMouseUp && !selected();

      if (disallowSelectedMouseUp || disallowUnselectedMouseUp) {
        return;
      }

      allowMouseSelection = true;
      itemRef?.click();
      allowMouseSelection = false;
    },
  });

  const contextValue: SelectItemContext = {
    selected,
    index,
    textRef: textRefBox,
    selectedByFocus,
    hasRegistered,
  };

  return (
    <SelectItemContext.Provider value={contextValue}>
      {renderElement('div', componentProps, {
        defaultClass: 'wheel-Select-Item',
        slot: 'select-item',
        state,
        ref: [
          buttonRef,
          (el: Element | null) => {
            itemRef = el as HTMLElement | null;
          },
          listItem.ref,
        ],
        props: [itemProps, defaultProps, elementProps, getButtonProps],
      })}
    </SelectItemContext.Provider>
  );
}

export interface SelectItemState {
  /**
   * Whether the item should ignore user interaction.
   */
  disabled: boolean;
  /**
   * Whether the item is selected.
   */
  selected: boolean;
  /**
   * Whether the item is highlighted.
   */
  highlighted: boolean;
}

export interface SelectItemProps
  extends NonNativeButtonProps,
    Omit<BaseUIComponentProps<'div', SelectItemState>, 'id'> {
  children?: JSX.Element;
  /**
   * A unique value that identifies this select item.
   * @default null
   */
  value?: any;
  /**
   * Whether the component should ignore user interaction.
   * @default false
   */
  disabled?: boolean | undefined;
  /**
   * Specifies the text label to use when the item is matched during keyboard text navigation.
   * Defaults to the item text content if not provided.
   */
  label?: string | undefined;
}

export namespace SelectItem {
  export type State = SelectItemState;
  export type Props = SelectItemProps;
}
