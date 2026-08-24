/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import type { JSX } from 'solid-js';
import { createSelector } from '../base-utils/store/createSelector';
import { SolidStore } from '../base-utils/store/SolidStore';
import type { InteractionType } from '../floating-ui-solid/components/FloatingFocusManager';
import type { TransitionStatus } from '../internals/createTransitionStatus';
import type { HTMLProps } from '../internals/types';
import type { Side } from '../utils/useAnchorPositioning';
import { compareItemEquality } from '../internals/itemEquality';
import { type Group, hasNullItemLabel, stringifyAsValue } from '../internals/resolveValueLabel';

export type State = {
  id: string | undefined;
  labelId: string | undefined;
  modal: boolean;
  multiple: boolean;

  items:
    | Record<string, JSX.Element>
    | ReadonlyArray<{ label: JSX.Element; value: any }>
    | ReadonlyArray<Group<any>>
    | undefined;
  itemToStringLabel: ((item: any) => string) | undefined;
  itemToStringValue: ((item: any) => string) | undefined;
  isItemEqualToValue: (itemValue: any, selectedValue: any) => boolean;

  value: any;

  open: boolean;
  mounted: boolean;
  forceMount: boolean;
  transitionStatus: TransitionStatus;
  openMethod: InteractionType | null;

  activeIndex: number | null;
  selectedIndex: number | null;

  popupProps: HTMLProps;
  triggerProps: HTMLProps;
  triggerElement: HTMLElement | null;
  positionerElement: HTMLElement | null;
  listElement: HTMLDivElement | null;
  popupSide: Side | 'none' | null;

  scrollUpArrowVisible: boolean;
  scrollDownArrowVisible: boolean;

  hasScrollArrows: boolean;
};

/**
 * Solid port of upstream's `select/store.ts`.
 *
 * Deviation: upstream's `Select` store is a plain `Store<State>` (unlike the popup-family
 * components, which extend `PopupStore`) because Select owns a single implicit trigger rather
 * than the multi-trigger/detached-trigger machinery `PopupStore` provides. This mirrors that:
 * `SelectStore` extends the base `SolidStore` directly.
 */
export class SelectStore extends SolidStore<State, Record<string, never>, typeof selectors> {
  constructor(initialState: State) {
    super(initialState, {}, selectors);
  }
}

export const selectors = {
  id: createSelector((state: State) => state.id),
  labelId: createSelector((state: State) => state.labelId),
  modal: createSelector((state: State) => state.modal),
  multiple: createSelector((state: State) => state.multiple),

  items: createSelector((state: State) => state.items),
  itemToStringLabel: createSelector((state: State) => state.itemToStringLabel),
  itemToStringValue: createSelector((state: State) => state.itemToStringValue),
  isItemEqualToValue: createSelector((state: State) => state.isItemEqualToValue),

  value: createSelector((state: State) => state.value),

  hasSelectedValue: createSelector((state: State) => {
    const { value, multiple, itemToStringValue } = state;
    if (value == null) {
      return false;
    }
    if (multiple && Array.isArray(value)) {
      return value.length > 0;
    }

    return stringifyAsValue(value, itemToStringValue) !== '';
  }),

  hasNullItemLabel: createSelector((state: State, enabled: boolean) => {
    return enabled ? hasNullItemLabel(state.items) : false;
  }),

  open: createSelector((state: State) => state.open),
  mounted: createSelector((state: State) => state.mounted),
  forceMount: createSelector((state: State) => state.forceMount),
  transitionStatus: createSelector((state: State) => state.transitionStatus),
  openMethod: createSelector((state: State) => state.openMethod),

  activeIndex: createSelector((state: State) => state.activeIndex),
  selectedIndex: createSelector((state: State) => state.selectedIndex),
  isActive: createSelector((state: State, index: number) => state.activeIndex === index),

  isSelected: createSelector((state: State, itemValue: any) => {
    const comparer = state.isItemEqualToValue;
    const storeValue = state.value;

    if (state.multiple) {
      return (
        Array.isArray(storeValue) &&
        storeValue.some((selectedItem) => compareItemEquality(itemValue, selectedItem, comparer))
      );
    }

    return compareItemEquality(itemValue, storeValue, comparer);
  }),
  isSelectedByFocus: createSelector((state: State, index: number) => {
    return state.selectedIndex === index;
  }),

  popupProps: createSelector((state: State) => state.popupProps),
  triggerProps: createSelector((state: State) => state.triggerProps),
  triggerElement: createSelector((state: State) => state.triggerElement),
  positionerElement: createSelector((state: State) => state.positionerElement),
  listElement: createSelector((state: State) => state.listElement),
  popupSide: createSelector((state: State) => state.popupSide),

  scrollUpArrowVisible: createSelector((state: State) => state.scrollUpArrowVisible),
  scrollDownArrowVisible: createSelector((state: State) => state.scrollDownArrowVisible),

  hasScrollArrows: createSelector((state: State) => state.hasScrollArrows),
};
