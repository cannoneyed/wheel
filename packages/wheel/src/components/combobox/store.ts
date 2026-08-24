/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createSelector } from '../base-utils/store/createSelector';
import { SolidStore } from '../base-utils/store/SolidStore';
import type { InteractionType } from '../floating-ui-solid/components/FloatingFocusManager';
import type { TransitionStatus } from '../internals/createTransitionStatus';
import type { HTMLProps } from '../internals/types';
import type { Side } from '../utils/useAnchorPositioning';
import { compareItemEquality } from '../internals/itemEquality';
import { hasNullItemLabel } from '../internals/resolveValueLabel';
import type { ComboboxRoot } from './root/ComboboxRoot';

export type SelectionMode = 'single' | 'multiple' | 'none';

export type State = {
  id: string | undefined;
  labelId: string | undefined;

  /**
   * The current (trimmed) input value used for filtering.
   */
  query: string;

  filter: (item: any, query: string) => boolean;

  items: readonly any[] | undefined;

  /**
   * Deviation: upstream keeps `inputValue` outside its `Store` (see
   * https://github.com/mui/base-ui/issues/2703, a React-specific
   * controlled/uncontrolled interaction) and threads it through a sibling
   * React context instead. `SolidStore`'s backing `createStore` is
   * fine-grained regardless of which keys are read together, so that
   * workaround isn't needed here — `inputValue` lives directly in state.
   */
  inputValue: string;

  selectedValue: any;

  open: boolean;
  mounted: boolean;
  transitionStatus: TransitionStatus;
  forceMounted: boolean;

  inline: boolean;

  activeIndex: number | null;
  selectedIndex: number | null;

  popupProps: HTMLProps;
  inputProps: HTMLProps;
  triggerProps: HTMLProps;
  itemProps: HTMLProps;

  positionerElement: HTMLElement | null;
  listElement: HTMLElement | null;
  popupId: string | undefined;
  triggerElement: HTMLElement | null;
  inputElement: HTMLInputElement | null;
  inputGroupElement: HTMLDivElement | null;
  popupSide: Side | null;

  openMethod: InteractionType | null;

  inputInsidePopup: boolean;
  inputOwnsFormValue: boolean;

  selectionMode: SelectionMode;

  name: string | undefined;
  form: string | undefined;
  disabled: boolean;
  readOnly: boolean;
  required: boolean;
  grid: boolean;
  isGrouped: boolean;
  virtualized: boolean;
  openOnInputClick: boolean;
  itemToStringLabel?: ((item: any) => string) | undefined;
  itemToStringValue?: ((item: any) => string) | undefined;
  isItemEqualToValue: (itemValue: any, selectedValue: any) => boolean;
  modal: boolean;
  autoHighlight: false | 'always' | 'input-change';
  submitOnItemClick: boolean;
  hasInputValue: boolean;
};

/**
 * Non-reactive bookkeeping (refs) and imperative callbacks, mirroring how
 * upstream's plain `Store<State>` mixes reactive fields with `React.RefObject`s
 * and stable callbacks in one object (`store.state.inputRef.current`,
 * `store.state.setOpen(...)`). `SolidStore` separates the two: this becomes
 * `store.context` while the rest lives in reactive `store.state`/selectors.
 */
export interface ComboboxStoreContext {
  listRef: { current: Array<HTMLElement | null> };
  labelsRef: { current: Array<string | null> };
  popupRef: { current: HTMLDivElement | null };
  emptyRef: { current: HTMLDivElement | null };
  inputRef: { current: HTMLInputElement | null };
  startDismissRef: { current: HTMLSpanElement | null };
  endDismissRef: { current: HTMLSpanElement | null };
  keyboardActiveRef: { current: boolean };
  chipsContainerRef: { current: HTMLDivElement | null };
  clearRef: { current: HTMLButtonElement | null };
  /** Currently visible (post-filter) item values, in display order. */
  valuesRef: { current: Array<any> };
  /** All registered item values in stable, unfiltered order (no `items` prop only). */
  allValuesRef: { current: Array<any> };
  selectionEventRef: { current: MouseEvent | PointerEvent | KeyboardEvent | null };

  setOpen: (open: boolean, eventDetails: ComboboxRoot.ChangeEventDetails) => void;
  setInputValue: (value: string, eventDetails: ComboboxRoot.ChangeEventDetails) => void;
  setSelectedValue: (value: any, eventDetails: ComboboxRoot.ChangeEventDetails) => void;
  setIndices: (indices: {
    activeIndex?: number | null | undefined;
    selectedIndex?: number | null | undefined;
    type?: 'keyboard' | 'pointer' | 'none' | undefined;
  }) => void;
  onItemHighlighted: (item: any, eventDetails: ComboboxRoot.HighlightEventDetails) => void;
  forceMount: () => void;
  handleSelection: (event: MouseEvent | PointerEvent | KeyboardEvent, passedValue?: any) => void;
  requestSubmit: () => void;
  onOpenChangeComplete: (open: boolean) => void;
}

/**
 * Solid port of upstream's `combobox/store.ts`.
 *
 * Like `SelectStore`, this extends `SolidStore` directly (not the popup-family
 * `PopupStore`): Combobox owns a single implicit trigger/input pair rather
 * than the multi-trigger machinery `PopupStore` provides.
 */
export class ComboboxStore extends SolidStore<State, ComboboxStoreContext, typeof selectors> {
  constructor(initialState: State, context: ComboboxStoreContext) {
    super(initialState, context, selectors);
  }
}

export const selectors = {
  id: createSelector((state: State) => state.id),
  labelId: createSelector((state: State) => state.labelId),

  query: createSelector((state: State) => state.query),
  filter: createSelector((state: State) => state.filter),
  items: createSelector((state: State) => state.items),

  inputValue: createSelector((state: State) => state.inputValue),

  selectedValue: createSelector((state: State) => state.selectedValue),
  hasSelectionChips: createSelector((state: State) => {
    const { selectedValue } = state;
    return Array.isArray(selectedValue) && selectedValue.length > 0;
  }),

  hasSelectedValue: createSelector((state: State) => {
    const { selectedValue, selectionMode } = state;
    if (selectedValue == null) {
      return false;
    }
    if (selectionMode === 'multiple' && Array.isArray(selectedValue)) {
      return selectedValue.length > 0;
    }
    return true;
  }),

  hasNullItemLabel: createSelector((state: State, enabled: boolean) => {
    return enabled ? hasNullItemLabel(state.items) : false;
  }),

  open: createSelector((state: State) => state.open),
  mounted: createSelector((state: State) => state.mounted),
  forceMounted: createSelector((state: State) => state.forceMounted),

  inline: createSelector((state: State) => state.inline),

  activeIndex: createSelector((state: State) => state.activeIndex),
  selectedIndex: createSelector((state: State) => state.selectedIndex),
  isActive: createSelector((state: State, index: number) => state.activeIndex === index),
  isSelected: createSelector((state: State, itemValue: any) => {
    const comparer = state.isItemEqualToValue;
    const { selectedValue } = state;
    if (Array.isArray(selectedValue)) {
      return selectedValue.some((selectedItem) =>
        compareItemEquality(itemValue, selectedItem, comparer),
      );
    }
    return compareItemEquality(itemValue, selectedValue, comparer);
  }),

  transitionStatus: createSelector((state: State) => state.transitionStatus),

  popupProps: createSelector((state: State) => state.popupProps),
  inputProps: createSelector((state: State) => state.inputProps),
  triggerProps: createSelector((state: State) => state.triggerProps),
  itemProps: createSelector((state: State) => state.itemProps),

  positionerElement: createSelector((state: State) => state.positionerElement),
  listElement: createSelector((state: State) => state.listElement),
  popupId: createSelector((state: State) => state.popupId),
  triggerElement: createSelector((state: State) => state.triggerElement),
  inputElement: createSelector((state: State) => state.inputElement),
  inputGroupElement: createSelector((state: State) => state.inputGroupElement),
  popupSide: createSelector((state: State) => state.popupSide),

  openMethod: createSelector((state: State) => state.openMethod),

  inputInsidePopup: createSelector((state: State) => state.inputInsidePopup),
  inputOwnsFormValue: createSelector((state: State) => state.inputOwnsFormValue),

  selectionMode: createSelector((state: State) => state.selectionMode),

  name: createSelector((state: State) => state.name),
  form: createSelector((state: State) => state.form),
  disabled: createSelector((state: State) => state.disabled),
  readOnly: createSelector((state: State) => state.readOnly),
  required: createSelector((state: State) => state.required),
  grid: createSelector((state: State) => state.grid),
  isGrouped: createSelector((state: State) => state.isGrouped),
  virtualized: createSelector((state: State) => state.virtualized),
  openOnInputClick: createSelector((state: State) => state.openOnInputClick),
  itemToStringLabel: createSelector((state: State) => state.itemToStringLabel),
  itemToStringValue: createSelector((state: State) => state.itemToStringValue),
  isItemEqualToValue: createSelector((state: State) => state.isItemEqualToValue),
  modal: createSelector((state: State) => state.modal),
  autoHighlight: createSelector((state: State) => state.autoHighlight),
  submitOnItemClick: createSelector((state: State) => state.submitOnItemClick),
  hasInputValue: createSelector((state: State) => state.hasInputValue),
};
