/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createEffect, onCleanup, splitProps, untrack, type JSX } from 'solid-js';
import {
  useComboboxDerivedItemsContext,
  useComboboxHasItemsContext,
  useComboboxRootContext,
} from '../root/ComboboxRootContext';
import {
  createCompositeListItem,
  IndexGuessBehavior,
} from '../../internals/composite/list/createCompositeListItem';
import type { BaseUIComponentProps, HTMLProps, NonNativeButtonProps } from '../../internals/types';
import { renderElement } from '../../internals/renderElement';
import { ComboboxItemContext } from './ComboboxItemContext';
import { createButton } from '../../internals/use-button/createButton';
import { useComboboxRowContext } from '../row/ComboboxRowContext';
import { compareItemEquality, findItemIndex } from '../../internals/itemEquality';

/**
 * An individual item in the list.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Combobox](https://base-ui.com/react/components/combobox)
 *
 * Deviation: upstream splits this into two component *types* (`ComboboxItemInner` /
 * `ComboboxItemVirtualizedIndex`) so that a runtime flip of `virtualized` remounts the item and
 * resets its refs/effects (React's model: a different component type at the same position always
 * remounts). Solid component bodies run exactly once per mount already, so a single function that
 * decides its indexing strategy from an *untracked* read of `virtualized` at setup time reproduces
 * the same "stable for the item's lifetime" behavior without the extra component split.
 */
export function ComboboxItem(componentProps: ComboboxItem.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'value',
    'index',
    'disabled',
    'nativeButton',
  ]);

  const itemValue = () => local.value ?? null;
  const disabled = () => local.disabled ?? false;
  const nativeButton = () => local.nativeButton ?? false;

  const store = useComboboxRootContext();
  const isRow = useComboboxRowContext();
  const hasItems = useComboboxHasItemsContext();
  const { flatFilteredItems } = useComboboxDerivedItemsContext();

  const virtualized = untrack(() => store.state.virtualized);
  const indexProp = () => local.index;

  const textRefBox: { current: HTMLElement | null } = { current: null };
  const listItem = createCompositeListItem<unknown>({
    index: indexProp,
    textRef: () => textRefBox.current,
    indexGuessBehavior: IndexGuessBehavior.GuessFromOrder,
  });

  const indexFromFilter = () =>
    findItemIndex(flatFilteredItems(), itemValue(), store.state.isItemEqualToValue);

  const index = () => {
    const explicitIndex = indexProp();
    if (explicitIndex != null) {
      return explicitIndex;
    }
    if (virtualized) {
      return indexFromFilter();
    }
    return listItem.index();
  };

  const hasRegistered = () => (indexProp() != null ? true : listItem.index() !== -1);

  const open = store.useState('open');
  const selectionMode = store.useState('selectionMode');
  const readOnly = store.useState('readOnly');

  const selectable = () => selectionMode() !== 'none';
  const rootId = store.useState('id');
  const highlighted = store.useState('isActive', index);
  const matchesSelectedValue = store.useState('isSelected', itemValue);
  const itemProps = store.useState('itemProps');

  let itemRef: HTMLDivElement | null = null;
  let didPointerDown = false;

  const id = () => (rootId() != null && hasRegistered() ? `${rootId()}-${index()}` : undefined);
  const selected = () => matchesSelectedValue() && selectable();

  createEffect(() => {
    const shouldRun = hasRegistered() && (virtualized || indexProp() != null);
    if (!shouldRun) {
      return;
    }

    const list = store.context.listRef.current;
    const currentIndex = index();
    list[currentIndex] = itemRef;

    onCleanup(() => {
      delete list[currentIndex];
    });
  });

  createEffect(() => {
    if (!hasRegistered() || hasItems()) {
      return;
    }

    const visibleMap = store.context.valuesRef.current;
    const currentIndex = index();
    visibleMap[currentIndex] = itemValue();

    if (selectionMode() !== 'none') {
      store.context.allValuesRef.current.push(itemValue());
    }

    onCleanup(() => {
      delete visibleMap[currentIndex];
    });
  });

  createEffect(() => {
    if (!open()) {
      didPointerDown = false;
      return;
    }

    if (!hasRegistered() || hasItems()) {
      return;
    }

    const selectedValue = store.state.selectedValue;
    const lastSelectedValue = Array.isArray(selectedValue)
      ? selectedValue[selectedValue.length - 1]
      : selectedValue;

    if (compareItemEquality(itemValue(), lastSelectedValue, store.state.isItemEqualToValue)) {
      store.set('selectedIndex', index());
    }
  });

  const { getButtonProps, buttonRef } = createButton({
    disabled,
    focusableWhenDisabled: () => true,
    native: nativeButton,
    composite: () => true,
  });

  const state: ComboboxItem.State = {
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

  function commitSelection(nativeEvent: MouseEvent) {
    function selectItem() {
      store.context.handleSelection(nativeEvent, itemValue());
    }

    if (store.state.submitOnItemClick) {
      selectItem();
      store.context.requestSubmit();
    } else {
      selectItem();
    }
  }

  const defaultProps = (): HTMLProps => ({
    id: id(),
    role: isRow ? 'gridcell' : 'option',
    'aria-selected': selectable() ? selected() : undefined,
    tabIndex: undefined,
    // NOTE (deviation): Solid's dynamic prop-spread runtime only recognizes the `oncapture:*`
    // namespace for real capture-phase attachment — a literal `onPointerDownCapture` key (as
    // upstream names it) would register a listener for a nonexistent "pointerdowncapture" DOM
    // event and silently never fire (see `useDismiss.ts`'s identical note).
    'oncapture:pointerdown': (event: PointerEvent) => {
      didPointerDown = true;
      event.preventDefault();
    },
    onMouseDown(event: MouseEvent) {
      event.preventDefault();
    },
    onClick(event: MouseEvent) {
      if (disabled() || readOnly()) {
        return;
      }
      commitSelection(event);
    },
    onMouseUp(event: MouseEvent) {
      const pointerStartedOnItem = didPointerDown;
      didPointerDown = false;

      if (disabled() || readOnly() || event.button !== 0 || pointerStartedOnItem || !highlighted()) {
        return;
      }

      commitSelection(event);
    },
  });

  const contextValue: ComboboxItemContext = {
    selected,
    textRef: textRefBox,
  };

  return (
    <ComboboxItemContext.Provider value={contextValue}>
      {renderElement('div', componentProps, {
        defaultClass: 'wheel-Combobox-Item',
        slot: 'combobox-item',
        state,
        ref: [
          buttonRef,
          (el: Element | null) => {
            itemRef = el as HTMLDivElement | null;
          },
          listItem.ref,
        ],
        props: [itemProps, defaultProps, elementProps, getButtonProps],
      })}
    </ComboboxItemContext.Provider>
  );
}

export interface ComboboxItemState {
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

export interface ComboboxItemProps
  extends NonNativeButtonProps,
    Omit<BaseUIComponentProps<'div', ComboboxItemState>, 'id'> {
  children?: JSX.Element;
  /**
   * The index of the item in the list. Improves performance when specified by avoiding the need to
   * calculate the index automatically from the DOM.
   */
  index?: number | undefined;
  /**
   * A unique value that identifies this item.
   * @default null
   */
  value?: any;
  /**
   * Whether the component should ignore user interaction.
   * @default false
   */
  disabled?: boolean | undefined;
}

export namespace ComboboxItem {
  export type State = ComboboxItemState;
  export type Props = ComboboxItemProps;
}
