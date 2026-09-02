/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-view-root -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { useSignal } from '../../../core/local-state';
import { createEffect, createMemo, on, untrack, type JSX } from 'solid-js';
import { createControllableSignal } from '../../base-utils/createControllableSignal';
import { EMPTY_ARRAY, EMPTY_OBJECT, NOOP } from '../../base-utils/empty';
import { mergeRefs } from '../../base-utils/mergeRefs';
import { visuallyHidden, visuallyHiddenInput } from '../../base-utils/visuallyHidden';
import {
  contains,
  getTarget,
  useClick,
  useDismiss,
  useFloatingRootContext,
  useListNavigation,
} from '../../floating-ui-solid';
import { gridNavigation } from '../../floating-ui-solid/hooks/gridNavigation';
import {
  ComboboxDerivedItemsContext,
  ComboboxFloatingContext,
  ComboboxHasItemsContext,
  ComboboxRootContext,
  type ComboboxDerivedItemsContextValue,
} from './ComboboxRootContext';
import { ComboboxStore, type ComboboxStoreContext, type State as StoreState } from '../store';
import { createChangeEventDetails, createGenericEventDetails, type BaseUIChangeEventDetails, type BaseUIGenericEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import { createOpenChangeComplete } from '../../internals/createOpenChangeComplete';
import { createTransitionStatus } from '../../internals/createTransitionStatus';
import { useFieldRootContext } from '../../internals/field-root-context/FieldRootContext';
import { registerFieldControl } from '../../internals/field-register-control/registerFieldControl';
import { useFormContext } from '../../internals/form-context/FormContext';
import { useLabelableId } from '../../internals/labelable-provider/useLabelableId';
import { createOpenInteractionType } from '../../utils/useOpenInteractionType';
import { FOCUSABLE_POPUP_PROPS } from '../../utils/popups';
import { mergeProps } from '../../merge-props/mergeProps';
import {
  isGroupedItems,
  stringifyAsLabel,
  stringifyAsValue,
  type Group,
} from '../../internals/resolveValueLabel';
import {
  compareItemEquality,
  defaultItemEquality,
  findItemIndex,
  removeItem,
  selectedValueIncludes,
} from '../../internals/itemEquality';
import { areArraysEqual } from '../../internals/areArraysEqual';
import { createCollatorItemFilter, createSingleSelectionCollatorFilter } from './utils/index';
import { createCoreFilter } from './utils/useFilter';
import { INITIAL_LAST_HIGHLIGHT, NO_ACTIVE_VALUE } from './utils/constants';
import { useDirection } from '../../internals/direction-context/DirectionContext';
import type { HTMLProps } from '../../internals/types';

type SelectionMode = 'single' | 'multiple' | 'none';

type ComboboxValueType<Value, Multiple extends boolean | undefined> = Multiple extends true
  ? Value[]
  : Value;

/**
 * Groups all parts of the combobox.
 * Doesn't render its own HTML element.
 *
 * Documentation: [Base UI Combobox](https://base-ui.com/react/components/combobox)
 *
 * Solid port of upstream's `combobox/root/ComboboxRoot.tsx` + `AriaCombobox.tsx`, flattened into a
 * single function (mirroring `SelectRoot`'s equivalent flattening of `AriaSelect`-style layering).
 *
 * Deviation: the public `Combobox.Root`'s `multiple` prop only ever maps `selectionMode` to
 * `'single'` or `'multiple'` — never `'none'`. Upstream's lower-level `AriaCombobox` also supports
 * a `selectionMode: 'none'` ("no persisted selection") mode together with `fillInputOnItemPress`
 * and an `autoComplete` ('list' | 'both' | 'inline' | 'none') `aria-autocomplete` hint; none of
 * those are reachable through `Combobox.Root`'s public API, but `Autocomplete.Root`
 * (`packages/solid/src/autocomplete/root/AutocompleteRoot.tsx`) needs exactly this lower layer, so
 * this component additionally accepts `selectionMode: 'none'`, `fillInputOnItemPress`, and
 * `autoCompleteMode` as internal-only escape hatches for that composition — mirroring upstream's
 * `AriaCombobox` semantics exactly. They're additive: omitted, behavior for `Combobox.Root` is
 * unchanged (`selectionMode` still only ever resolves to `'single'`/`'multiple'`). The
 * `'both'`/`'inline'` inline-autocompletion *text-mutation* itself is not part of this layer either
 * upstream or here — `AutocompleteRoot` composes that entirely on top via this component's
 * already-controlled `inputValue`/`onInputValueChange`. `actionsRef` (imperative `unmount`) is also
 * not ported, matching `SelectRoot`'s equivalent deviation.
 */
export function ComboboxRoot<Value, Multiple extends boolean | undefined = false>(
  componentProps: ComboboxRoot.Props<Value, Multiple>,
): JSX.Element {
  const multipleProp = () => componentProps.multiple ?? false;
  // `componentProps.selectionMode` is an internal-only escape hatch (see the class doc comment
  // above): only `Autocomplete.Root` sets it (always to `'none'`), so `Combobox.Root`'s public
  // `multiple` boolean continues to be the sole driver of `selectionMode` for every other caller.
  const selectionMode = (): SelectionMode =>
    componentProps.selectionMode ?? (multipleProp() ? 'multiple' : 'single');
  const multiple = () => selectionMode() === 'multiple';
  const single = () => selectionMode() === 'single';

  const disabledProp = () => componentProps.disabled ?? false;
  const readOnly = () => componentProps.readOnly ?? false;
  const required = () => componentProps.required ?? false;
  const grid = () => componentProps.grid ?? false;
  const modal = () => componentProps.modal ?? false;
  const virtualized = () => componentProps.virtualized ?? false;
  const openOnInputClick = () => componentProps.openOnInputClick ?? true;
  const loopFocus = () => componentProps.loopFocus ?? true;
  const highlightItemOnHover = () => componentProps.highlightItemOnHover ?? true;
  const keepHighlight = () => componentProps.keepHighlight ?? false;
  const inlineProp = () => componentProps.inline ?? false;
  const limit = () => componentProps.limit ?? -1;
  const submitOnItemClick = () => componentProps.submitOnItemClick ?? false;
  const isItemEqualToValue = () => componentProps.isItemEqualToValue ?? defaultItemEquality;
  // INTERNAL: only meaningful when `selectionMode() === 'none'` (see class doc comment).
  const fillInputOnItemPress = () => componentProps.fillInputOnItemPress ?? true;

  const { clearErrors } = useFormContext();
  const {
    setDirty,
    validityData,
    setFilled,
    name: fieldName,
    disabled: fieldDisabled,
    setTouched,
    setFocused,
    validationMode,
    validation,
  } = useFieldRootContext();

  const direction = useDirection();
  const generatedId = useLabelableId({ id: () => componentProps.id });
  const collatorFilter = untrack(() => createCoreFilter({ locale: componentProps.locale }));

  const disabled = () => (fieldDisabled() || disabledProp()) ?? false;
  const name = () => fieldName() ?? componentProps.name;

  const [queryChangedAfterOpenGet, setQueryChangedAfterOpen] = useSignal(false, 'queryChangedAfterOpenGet');
  const [closeQuery, setCloseQuery] = useSignal<string | null>(null, 'closeQuery');

  // Plain mutable containers (`{ current }`), matching every other port's `useRef` translation.
  const listElements: Array<HTMLElement | null> = [];
  const labelElements: Array<string | null> = [];
  const listRef = { current: listElements };
  const labelsRef = { current: labelElements };
  const popupRef: { current: HTMLDivElement | null } = { current: null };
  const inputRef: { current: HTMLInputElement | null } = { current: null };
  const startDismissRef: { current: HTMLSpanElement | null } = { current: null };
  const endDismissRef: { current: HTMLSpanElement | null } = { current: null };
  const emptyRef: { current: HTMLDivElement | null } = { current: null };
  const keyboardActiveRef = { current: true };
  const chipsContainerRef: { current: HTMLDivElement | null } = { current: null };
  const clearRef: { current: HTMLButtonElement | null } = { current: null };
  const selectionEventRef: { current: MouseEvent | PointerEvent | KeyboardEvent | null } = {
    current: null,
  };
  const valuesRef: { current: any[] } = { current: [] };
  const allValuesRef: { current: any[] } = { current: [] };

  let hadInputClear = false;
  let lastHighlight: { value: any; index: number } = INITIAL_LAST_HIGHLIGHT;
  let pendingQueryHighlight: null | { hasQuery: boolean } = null;

  const hasInputValue = untrack(
    () => componentProps.inputValue !== undefined || componentProps.defaultInputValue !== undefined,
  );

  const [selectedValue, setSelectedValueUnwrapped] = createControllableSignal<any>({
    controlled: () => componentProps.value,
    default: multiple() ? ((componentProps.defaultValue as any) ?? EMPTY_ARRAY) : (componentProps.defaultValue ?? null),
    name: 'Combobox',
    state: 'selectedValue',
  });

  const filter = createMemo(() => {
    const filterProp = componentProps.filter;
    if (filterProp === null) {
      return () => true;
    }
    if (filterProp !== undefined) {
      return filterProp;
    }
    if (single() && !queryChangedAfterOpenGet()) {
      return createSingleSelectionCollatorFilter(
        collatorFilter,
        componentProps.itemToStringLabel,
        selectedValue(),
      );
    }
    return createCollatorItemFilter(collatorFilter, componentProps.itemToStringLabel);
  });

  const initialDefaultInputValue = untrack(() => {
    if (hasInputValue) {
      return componentProps.defaultInputValue ?? '';
    }
    if (single()) {
      return stringifyAsLabel(selectedValue(), componentProps.itemToStringLabel);
    }
    return '';
  });

  const [inputValue, setInputValueUnwrapped] = createControllableSignal<string>({
    controlled: () => componentProps.inputValue as string | undefined,
    default: String(initialDefaultInputValue ?? ''),
    name: 'Combobox',
    state: 'inputValue',
  });

  const [open, setOpenUnwrapped] = createControllableSignal<boolean>({
    controlled: () => componentProps.open,
    default: componentProps.defaultOpen ?? false,
    name: 'Combobox',
    state: 'open',
  });

  const isGrouped = createMemo(() => isGroupedItems(componentProps.items));
  const query = createMemo(() => {
    const cq = closeQuery();
    if (cq != null) {
      return cq;
    }
    return inputValue() === '' ? '' : String(inputValue()).trim();
  });

  const selectedLabelString = createMemo(() =>
    single() ? stringifyAsLabel(selectedValue(), componentProps.itemToStringLabel) : '',
  );

  const shouldBypassFiltering = createMemo(() => {
    const q = query();
    const labelStr = selectedLabelString();
    return (
      single() &&
      !queryChangedAfterOpenGet() &&
      q !== '' &&
      labelStr !== '' &&
      labelStr.length === q.length &&
      collatorFilter.contains(labelStr, q)
    );
  });

  const hasItems = () => componentProps.items !== undefined;
  const hasFilteredItemsProp = () => componentProps.filteredItems !== undefined;

  const filterQuery = createMemo(() => (shouldBypassFiltering() ? '' : query()));
  const shouldIgnoreExternalFiltering = createMemo(
    () => hasItems() && hasFilteredItemsProp() && shouldBypassFiltering(),
  );

  const flatItems = createMemo<readonly any[]>(() => {
    const items = componentProps.items;
    if (!items) {
      return EMPTY_ARRAY;
    }
    if (isGrouped()) {
      return (items as ReadonlyArray<Group<any>>).flatMap((group) => group.items);
    }
    return items as readonly any[];
  });

  const filteredItems = createMemo<any[]>(() => {
    const filteredItemsProp = componentProps.filteredItems;
    if (filteredItemsProp && !shouldIgnoreExternalFiltering()) {
      return filteredItemsProp as any[];
    }

    const items = componentProps.items;
    if (!items) {
      return EMPTY_ARRAY as any[];
    }

    const fq = filterQuery();
    const lim = limit();
    const itemToStringLabel = componentProps.itemToStringLabel;
    const filterFn = filter();

    if (isGrouped()) {
      const groupedItems = items as ReadonlyArray<Group<any>>;
      const resultingGroups: Group<any>[] = [];
      let currentCount = 0;

      for (const group of groupedItems) {
        if (lim > -1 && currentCount >= lim) {
          break;
        }

        const remainingLimit = lim > -1 ? lim - currentCount : Infinity;
        const itemsToTake = fq === '' ? group.items.slice(0, remainingLimit) : [];

        if (fq !== '') {
          for (const item of group.items) {
            if (itemsToTake.length >= remainingLimit) {
              break;
            }
            if (filterFn(item, fq, itemToStringLabel)) {
              itemsToTake.push(item);
            }
          }
        }

        if (itemsToTake.length > 0) {
          resultingGroups.push({ ...group, items: itemsToTake });
          currentCount += itemsToTake.length;
        }
      }

      return resultingGroups;
    }

    if (fq === '') {
      return lim > -1 ? flatItems().slice(0, lim) : (flatItems() as any[]);
    }

    const limitedItems: any[] = [];
    for (const item of flatItems()) {
      if (lim > -1 && limitedItems.length >= lim) {
        break;
      }
      if (filterFn(item, fq, itemToStringLabel)) {
        limitedItems.push(item);
      }
    }

    return limitedItems;
  });

  const flatFilteredItems = createMemo<any[]>(() => {
    if (isGrouped()) {
      return (filteredItems() as Group<any>[]).flatMap((g) => g.items);
    }
    return filteredItems() as any[];
  });

  // INTERNAL: for `selectionMode() === 'none'` (only reachable via `Autocomplete.Root`), the
  // field's raw/registered value is the typed input text, not a persisted selection — mirrors
  // upstream's `fieldRawValue = selectionMode === 'none' ? inputValue : selectedValue`.
  const fieldRawValue = () => (selectionMode() === 'none' ? inputValue() : selectedValue());
  const fieldStringValue = createMemo(() => {
    if (selectionMode() === 'none') {
      return fieldRawValue();
    }
    const current = selectedValue();
    if (Array.isArray(current)) {
      return current.map((v) => stringifyAsValue(v, componentProps.itemToStringValue));
    }
    return stringifyAsValue(current, componentProps.itemToStringValue);
  });

  const noop = NOOP as unknown;
  const initialContext: ComboboxStoreContext = {
    listRef,
    labelsRef,
    popupRef,
    emptyRef,
    inputRef,
    startDismissRef,
    endDismissRef,
    keyboardActiveRef,
    chipsContainerRef,
    clearRef,
    valuesRef,
    allValuesRef,
    selectionEventRef,
    setOpen: noop as ComboboxStoreContext['setOpen'],
    setInputValue: noop as ComboboxStoreContext['setInputValue'],
    setSelectedValue: noop as ComboboxStoreContext['setSelectedValue'],
    setIndices: noop as ComboboxStoreContext['setIndices'],
    onItemHighlighted: noop as ComboboxStoreContext['onItemHighlighted'],
    forceMount: NOOP,
    handleSelection: noop as ComboboxStoreContext['handleSelection'],
    requestSubmit: NOOP,
    onOpenChangeComplete: NOOP,
  };

  const { mounted, setMounted, transitionStatus } = createTransitionStatus(open);
  const { openMethod, triggerProps: interactionTypeProps } = createOpenInteractionType(open);

  const store = new ComboboxStore(
    untrack(() => ({
      id: generatedId(),
      labelId: undefined,
      query: query(),
      filter: filter(),
      items: componentProps.items as StoreState['items'],
      inputValue: inputValue(),
      selectedValue: selectedValue(),
      open: open(),
      mounted: mounted(),
      transitionStatus: transitionStatus(),
      forceMounted: false,
      inline: inlineProp(),
      activeIndex: null,
      selectedIndex: null,
      popupProps: EMPTY_OBJECT,
      inputProps: EMPTY_OBJECT,
      triggerProps: EMPTY_OBJECT,
      itemProps: EMPTY_OBJECT,
      positionerElement: null,
      listElement: null,
      popupId: undefined,
      triggerElement: null,
      inputElement: null,
      inputGroupElement: null,
      popupSide: null,
      openMethod: null,
      inputInsidePopup: true,
      // Avoid duplicate names in the server HTML: popup inputs aren't rendered until after
      // hydration, so the hidden input takes over then if needed (mirrors upstream's identical
      // initial-value comment/computation for `AriaCombobox`'s equivalent field).
      inputOwnsFormValue: selectionMode() === 'none',
      selectionMode: selectionMode(),
      name: name(),
      form: componentProps.form,
      disabled: disabled(),
      readOnly: readOnly(),
      required: required(),
      grid: grid(),
      isGrouped: isGrouped(),
      virtualized: virtualized(),
      openOnInputClick: openOnInputClick(),
      itemToStringLabel: componentProps.itemToStringLabel,
      itemToStringValue: componentProps.itemToStringValue,
      isItemEqualToValue: isItemEqualToValue(),
      modal: modal(),
      autoHighlight: false,
      submitOnItemClick: submitOnItemClick(),
      hasInputValue,
    })),
    initialContext,
  );

  const autoHighlightMode = (): false | 'always' | 'input-change' => {
    if (componentProps.autoHighlight === 'always') {
      return 'always';
    }
    return componentProps.autoHighlight ? 'input-change' : false;
  };

  const activeIndex = store.useState('activeIndex');
  const selectedIndex = store.useState('selectedIndex');
  const positionerElement = store.useState('positionerElement');
  const listElement = store.useState('listElement');
  const triggerElement = store.useState('triggerElement');
  const inputElement = store.useState('inputElement');
  const inputGroupElement = store.useState('inputGroupElement');
  const inline = store.useState('inline');
  const inputInsidePopup = store.useState('inputInsidePopup');

  // INTERNAL: only meaningful when `selectionMode() === 'none'` (see class doc comment) — mirrors
  // upstream's `inputOwnsFormValue: selectionMode === 'none' && (inlineProp || !inputInsidePopup)`.
  const inputOwnsFormValue = () =>
    selectionMode() === 'none' && (inlineProp() || !inputInsidePopup());

  const controlRef: { current: HTMLElement | null } = { current: null };
  createEffect(() => {
    controlRef.current = inputInsidePopup() ? triggerElement() : inputElement();
  });

  registerFieldControl(
    controlRef,
    generatedId,
    fieldRawValue,
    fieldStringValue,
    () => !disabled(),
    () => componentProps.name,
  );

  const forceMount = () => {
    if (componentProps.items) {
      labelsRef.current = flatFilteredItems().map((item) =>
        stringifyAsLabel(item, componentProps.itemToStringLabel),
      );
    } else {
      store.set('forceMounted', true);
    }
  };

  const setIndices = (options: {
    activeIndex?: number | null | undefined;
    selectedIndex?: number | null | undefined;
    type?: 'none' | 'keyboard' | 'pointer' | undefined;
  }) => {
    const type = options.type || 'none';

    // Compute (and apply to `lastHighlight`) the notification this call itself owns BEFORE
    // `store.update()` below. Solid's un-batched signal writes can synchronously re-run the
    // general highlight-sync effect further down this file (which reads `activeIndex`/`open`/etc.
    // and independently notifies `onItemHighlighted` with reason `'none'` whenever `lastHighlight`
    // looks stale) from inside that very `store.update()` call — before this function would
    // otherwise get a chance to refresh `lastHighlight` itself. Updating `lastHighlight` first
    // keeps that effect's own staleness check accurate, so it no longer sees (and redundantly
    // re-announces) the change this call is already about to report with its correct
    // `'keyboard'`/`'pointer'`/`'none'` reason. Upstream doesn't need this reordering: React's
    // plain (non-reactive) `Store.update` never re-runs a `useIsoLayoutEffect` synchronously like
    // this, so `lastHighlightRef` there is always refreshed before that effect next runs.
    let notify: (() => void) | null = null;

    if (options.activeIndex !== undefined) {
      if (options.activeIndex === null) {
        if (lastHighlight !== INITIAL_LAST_HIGHLIGHT) {
          lastHighlight = INITIAL_LAST_HIGHLIGHT;
          notify = () =>
            onItemHighlighted(undefined, createGenericEventDetails(type, undefined, { index: -1 }));
        }
      } else {
        const activeValue = valuesRef.current[options.activeIndex];
        lastHighlight = { value: activeValue, index: options.activeIndex };
        notify = () =>
          onItemHighlighted(
            activeValue,
            createGenericEventDetails(type, undefined, { index: options.activeIndex as number }),
          );
      }
    }

    store.update(options as Partial<StoreState>);

    notify?.();
  };

  function onItemHighlighted(
    highlightedValue: any,
    eventDetails: ComboboxRoot.HighlightEventDetails,
  ) {
    componentProps.onItemHighlighted?.(highlightedValue, eventDetails);
  }

  const setInputValue = (next: string, eventDetails: ComboboxRoot.ChangeEventDetails) => {
    hadInputClear = eventDetails.reason === REASONS.inputClear;

    componentProps.onInputValueChange?.(next, eventDetails);

    if (eventDetails.isCanceled) {
      return;
    }

    if (eventDetails.reason === REASONS.inputChange) {
      const event = eventDetails.event as Event;
      const inputType = (event as InputEvent).inputType;
      const isTypedInput =
        event.type === 'compositionend' ||
        (inputType != null && inputType !== '' && inputType !== 'insertReplacementText');
      if (isTypedInput) {
        const hasQuery = next.trim() !== '';
        if (hasQuery) {
          setQueryChangedAfterOpen(true);
        }
        pendingQueryHighlight = { hasQuery };
        if (hasQuery && autoHighlightMode() && store.state.activeIndex == null) {
          store.set('activeIndex', 0);
        }
      }
    }

    setInputValueUnwrapped(next);
  };

  const setOpen = (nextOpen: boolean, eventDetails: ComboboxRoot.ChangeEventDetails) => {
    if (untrack(open) === nextOpen) {
      return;
    }

    if (
      eventDetails.reason === REASONS.escapeKey &&
      hasItems() &&
      flatFilteredItems().length === 0 &&
      !emptyRef.current
    ) {
      eventDetails.allowPropagation();
    }

    componentProps.onOpenChange?.(nextOpen, eventDetails);

    if (eventDetails.isCanceled) {
      return;
    }

    if (nextOpen && multiple() && inputInsidePopup() && !inline() && closeQuery() !== null) {
      setQueryChangedAfterOpen(false);
      setCloseQuery(null);

      if (untrack(inputValue) !== '') {
        setInputValue('', createChangeEventDetails(REASONS.inputClear, eventDetails.event));
      }
    }

    if (!nextOpen && queryChangedAfterOpenGet()) {
      if (single()) {
        if (!inline()) {
          setCloseQuery(query());
        }
        if (query() === '') {
          setQueryChangedAfterOpen(false);
        }
      } else if (multiple()) {
        if (!inline()) {
          setCloseQuery(query());
        }

        if (inputInsidePopup()) {
          setIndices({ activeIndex: null });
        }

        if (!inputInsidePopup() || inline()) {
          setInputValue('', createChangeEventDetails(REASONS.inputClear, eventDetails.event));
        }
      }
    }

    setOpenUnwrapped(nextOpen);

    if (
      !nextOpen &&
      inputInsidePopup() &&
      (eventDetails.reason === REASONS.focusOut || eventDetails.reason === REASONS.outsidePress)
    ) {
      setTouched(true);
      setFocused(false);

      if (validationMode() === 'onBlur') {
        validation.commit(single() || multiple() ? untrack(selectedValue) : untrack(inputValue));
      }
    }
  };

  const setSelectedValue = (nextValue: any, eventDetails: ComboboxRoot.ChangeEventDetails) => {
    componentProps.onValueChange?.(nextValue, eventDetails);

    if (eventDetails.isCanceled) {
      return;
    }

    setSelectedValueUnwrapped(nextValue);

    // INTERNAL: `selectionMode() === 'none'` branch only reachable via `Autocomplete.Root`
    // (`fillInputOnItemPress`, default `true`) — mirrors upstream's `AriaCombobox` exactly.
    const shouldFillInput =
      (selectionMode() === 'none' && popupRef.current && fillInputOnItemPress()) ||
      (single() && !store.state.inputInsidePopup);

    if (shouldFillInput) {
      setInputValue(
        stringifyAsLabel(nextValue, componentProps.itemToStringLabel),
        createChangeEventDetails(eventDetails.reason, eventDetails.event),
      );
    }

    if (
      single() &&
      nextValue != null &&
      eventDetails.reason !== REASONS.inputChange &&
      queryChangedAfterOpenGet() &&
      !inline()
    ) {
      setCloseQuery(query());
    }
  };

  const handleSelection = (event: MouseEvent | PointerEvent | KeyboardEvent, passedValue?: any) => {
    let itemValue = passedValue;
    if (itemValue === undefined) {
      if (activeIndex() === null) {
        return;
      }
      itemValue = valuesRef.current[activeIndex()!];
    }

    const targetEl = getTarget(event) as HTMLElement | null;
    const overrideEvent = selectionEventRef.current ?? event;
    selectionEventRef.current = null;
    const eventDetails = createChangeEventDetails(REASONS.itemPress, overrideEvent);

    const href = targetEl?.closest('a')?.getAttribute('href');
    if (href) {
      if (href.startsWith('#')) {
        setOpen(false, eventDetails);
      }
      return;
    }

    if (multiple()) {
      const currentSelectedValue = Array.isArray(selectedValue()) ? selectedValue() : [];
      const isCurrentlySelected = selectedValueIncludes(
        currentSelectedValue,
        itemValue,
        store.state.isItemEqualToValue,
      );
      const nextValue = isCurrentlySelected
        ? removeItem(currentSelectedValue, itemValue, store.state.isItemEqualToValue)
        : [...currentSelectedValue, itemValue];

      setSelectedValue(nextValue, eventDetails);

      if (eventDetails.isCanceled) {
        return;
      }

      const wasFiltering = inputRef.current ? inputRef.current.value.trim() !== '' : false;
      if (!wasFiltering) {
        return;
      }

      if (store.state.inputInsidePopup) {
        setInputValue('', createChangeEventDetails(REASONS.inputClear, eventDetails.event));
      } else {
        setOpen(false, eventDetails);
      }
    } else {
      setSelectedValue(itemValue, eventDetails);

      if (eventDetails.isCanceled) {
        return;
      }

      setOpen(false, eventDetails);
    }
  };

  const requestSubmit = () => {
    if (!store.state.submitOnItemClick) {
      return;
    }

    const formElement =
      (validation.inputRef.current as HTMLInputElement | null)?.form ?? store.state.inputElement?.form;
    if (formElement && typeof formElement.requestSubmit === 'function') {
      formElement.requestSubmit();
    }
  };

  const handleUnmount = () => {
    setMounted(false);
    componentProps.onOpenChangeComplete?.(false);
    setQueryChangedAfterOpen(false);
    setCloseQuery(null);

    if (selectionMode() === 'none') {
      setIndices({ activeIndex: null, selectedIndex: null });
    } else {
      setIndices({ activeIndex: null });
    }

    if (multiple() && inputRef.current && inputRef.current.value !== '' && !hadInputClear) {
      setInputValue('', createChangeEventDetails(REASONS.inputClear));
    }

    if (single()) {
      if (store.state.inputInsidePopup) {
        if (inputRef.current && inputRef.current.value !== '') {
          setInputValue('', createChangeEventDetails(REASONS.inputClear));
        }
      } else {
        const stringVal = stringifyAsLabel(selectedValue(), componentProps.itemToStringLabel);
        if (inputRef.current && inputRef.current.value !== stringVal) {
          const reason = stringVal === '' ? REASONS.inputClear : REASONS.none;
          setInputValue(stringVal, createChangeEventDetails(reason));
        }
      }
    }
  };

  Object.assign(store.context, {
    setOpen,
    setInputValue,
    setSelectedValue,
    setIndices,
    onItemHighlighted,
    forceMount,
    handleSelection,
    requestSubmit,
    onOpenChangeComplete: (nextOpen: boolean) => componentProps.onOpenChangeComplete?.(nextOpen),
  } satisfies Partial<ComboboxStoreContext>);

  const resolvedPopupRef = createMemo<{ current: HTMLElement | null }>(() => {
    if (inline() && positionerElement()) {
      return { current: (positionerElement() as HTMLElement).closest('[role="dialog"]') };
    }
    return popupRef;
  });

  createOpenChangeComplete({
    open,
    getElement: () => resolvedPopupRef().current,
    onComplete() {
      if (!open()) {
        handleUnmount();
      }
    },
  });

  createEffect(
    on(
      [open, selectionMode],
      () => {
        if (open() || selectionMode() === 'none') {
          return;
        }

        const registry = componentProps.items ? flatItems() : allValuesRef.current;
        const comparer = isItemEqualToValue();

        if (multiple()) {
          const currentValue = Array.isArray(selectedValue()) ? selectedValue() : [];
          const lastValue = currentValue[currentValue.length - 1];
          const lastIndex = findItemIndex(registry, lastValue, comparer);
          setIndices({ selectedIndex: lastIndex === -1 ? null : lastIndex });
        } else {
          const index = findItemIndex(registry, selectedValue(), comparer);
          setIndices({ selectedIndex: index === -1 ? null : index });
        }
      },
    ),
  );

  createEffect(() => {
    if (componentProps.items) {
      valuesRef.current = flatFilteredItems();
      listRef.current.length = flatFilteredItems().length;
    }
  });

  createEffect(() => {
    if (pendingQueryHighlight) {
      if (pendingQueryHighlight.hasQuery) {
        if (autoHighlightMode()) {
          store.set('activeIndex', 0);
        }
      } else if (autoHighlightMode() === 'always') {
        store.set('activeIndex', 0);
      }
      pendingQueryHighlight = null;
    }

    if (!open() && !inline()) {
      return;
    }

    const shouldUseFlatFilteredItems = hasItems() || hasFilteredItemsProp();
    const candidateItems = shouldUseFlatFilteredItems ? flatFilteredItems() : valuesRef.current;
    const storeActiveIndex = activeIndex();

    if (storeActiveIndex == null) {
      if (autoHighlightMode() === 'always' && candidateItems.length > 0) {
        store.set('activeIndex', 0);
        return;
      }
      if (lastHighlight !== INITIAL_LAST_HIGHLIGHT) {
        lastHighlight = INITIAL_LAST_HIGHLIGHT;
        onItemHighlighted(undefined, createGenericEventDetails(REASONS.none, undefined, { index: -1 }));
      }
      return;
    }

    if (storeActiveIndex >= candidateItems.length) {
      if (lastHighlight !== INITIAL_LAST_HIGHLIGHT) {
        lastHighlight = INITIAL_LAST_HIGHLIGHT;
        onItemHighlighted(undefined, createGenericEventDetails(REASONS.none, undefined, { index: -1 }));
      }
      store.set('activeIndex', null);
      return;
    }

    const itemValue = candidateItems[storeActiveIndex];
    const previouslyHighlightedItemValue = lastHighlight.value;
    const isSameItem =
      previouslyHighlightedItemValue !== NO_ACTIVE_VALUE &&
      compareItemEquality(itemValue, previouslyHighlightedItemValue, store.state.isItemEqualToValue);

    if (lastHighlight.index !== storeActiveIndex || !isSameItem) {
      lastHighlight = { value: itemValue, index: storeActiveIndex };
      onItemHighlighted(
        itemValue,
        createGenericEventDetails(REASONS.none, undefined, { index: storeActiveIndex }),
      );
    }
  });

  createEffect(() => {
    if (selectionMode() === 'none') {
      setFilled(String(inputValue()) !== '');
      return;
    }
    setFilled(
      multiple() ? Array.isArray(selectedValue()) && selectedValue().length > 0 : selectedValue() != null,
    );
  });

  createEffect(() => {
    if (hasItems() && autoHighlightMode() && flatFilteredItems().length === 0) {
      setIndices({ activeIndex: null });
    }
  });

  function isSelectedValueDirty(value: any) {
    const initialValue = validityData().initialValue;

    if (Array.isArray(value) && Array.isArray(initialValue)) {
      return !areArraysEqual(value, initialValue, (itemValue, initialItemValue) =>
        compareItemEquality(itemValue, initialItemValue, isItemEqualToValue()),
      );
    }

    return value !== initialValue;
  }

  createEffect(
    on(
      query,
      () => {
        if (!open() || query() === '' || query() === String(initialDefaultInputValue)) {
          return;
        }
        setQueryChangedAfterOpen(true);
      },
      { defer: true },
    ),
  );

  createEffect(
    on(
      selectedValue,
      () => {
        // INTERNAL: `selectedValue` isn't a persisted concept in `selectionMode() === 'none'`
        // (only reachable via `Autocomplete.Root`) — dirty/validation there track `inputValue`
        // instead (see the effect below), mirroring upstream's `AriaCombobox` exactly.
        if (selectionMode() === 'none') {
          return;
        }

        clearErrors(name());
        setDirty(isSelectedValueDirty(selectedValue()));
        validation.change(selectedValue());

        if (single() && !hasInputValue && !inputInsidePopup()) {
          const nextInputValue = stringifyAsLabel(selectedValue(), componentProps.itemToStringLabel);
          if (untrack(inputValue) !== nextInputValue) {
            setInputValue(nextInputValue, createChangeEventDetails(REASONS.none));
          }
        }
      },
      { defer: true },
    ),
  );

  createEffect(
    on(
      inputValue,
      () => {
        if (selectionMode() !== 'none') {
          return;
        }

        clearErrors(name());
        setDirty(inputValue() !== validityData().initialValue);
        validation.change(inputValue());
      },
      { defer: true },
    ),
  );

  createEffect(
    on(
      () => componentProps.items,
      () => {
        if (!single() || hasInputValue || inputInsidePopup() || queryChangedAfterOpenGet()) {
          return;
        }

        const nextInputValue = stringifyAsLabel(selectedValue(), componentProps.itemToStringLabel);
        if (untrack(inputValue) !== nextInputValue) {
          setInputValue(nextInputValue, createChangeEventDetails(REASONS.none));
        }
      },
      { defer: true },
    ),
  );

  const floatingRootContext = useFloatingRootContext({
    open: () => (inline() ? true : open()),
    onOpenChange: setOpen as (open: boolean, eventDetails: BaseUIChangeEventDetails<string>) => void,
    elements: {
      reference: () => (inputInsidePopup() ? triggerElement() : inputElement()),
      floating: positionerElement,
    },
  });

  // Cast note: the shared `ElementProps` type (`floating-ui-solid/types.ts`) declares
  // `reference`/`floating` as plain `HTMLProps`, not accounting for hooks (like
  // `useListNavigation`) that return a reactive thunk for these fields — so the static type
  // doesn't have a call signature even though the runtime value here does (mirrors
  // `SelectRoot.tsx`'s identical `resolveThunkProps` helper).
  const resolveThunkProps = (value: unknown): HTMLProps =>
    typeof value === 'function' ? (value as () => HTMLProps)() : (value as HTMLProps);

  const ariaHasPopup = () => (inline() ? undefined : grid() ? 'grid' : 'listbox');
  const ariaExpanded = () => (inline() ? undefined : open() ? 'true' : 'false');

  const roleReference = (): HTMLProps => {
    const isPlainInput = inputElement()?.tagName === 'INPUT';
    const shouldTreatAsInput = inputElement() == null || isPlainInput;
    const shouldApplyAria = shouldTreatAsInput || open();

    const reference: HTMLProps = shouldTreatAsInput
      ? {
          autocomplete: 'off',
          spellcheck: false,
          autocorrect: 'off',
          autocapitalize: 'none',
        }
      : {};

    if (shouldApplyAria) {
      reference.role = 'combobox';
      reference['aria-expanded'] = ariaExpanded();
      reference['aria-haspopup'] = ariaHasPopup();
      reference['aria-controls'] = open() ? listElement()?.id : undefined;
      // INTERNAL: `componentProps.autoCompleteMode` (only set by `Autocomplete.Root`, from its
      // `mode` prop) mirrors upstream's `AriaCombobox` `autoComplete` prop; `Combobox.Root` always
      // leaves it unset, so this remains hardcoded to `'list'` for every other caller.
      reference['aria-autocomplete'] = componentProps.autoCompleteMode ?? 'list';
    }

    return reference;
  };

  const click = useClick(floatingRootContext, {
    enabled: () => !readOnly() && !disabled() && openOnInputClick(),
    event: () => 'mousedown-only',
    toggle: () => false,
    touchOpenDelay: () => (inputInsidePopup() ? 0 : 100),
    reason: () => REASONS.inputPress,
  });

  const dismiss = useDismiss(floatingRootContext, {
    enabled: () => !readOnly() && !disabled() && !inline(),
    outsidePressEvent: () => ({ mouse: 'sloppy' as const, touch: 'intentional' as const }),
    // `useDismiss`'s `bubbles` accessor (when provided) must always resolve to a definite
    // `boolean | {...}` — it can't itself return `undefined` — so the "let normalizeProp fall back
    // to its defaults" behavior upstream gets from `bubbles: inline ? true : undefined` is instead
    // expressed by omitting the whole `bubbles` field when not inline.
    bubbles: inline() ? () => true : undefined,
    outsidePress: () => (event: MouseEvent | TouchEvent) => {
      const target = getTarget(event) as Element | null;
      return (
        !contains(triggerElement(), target) &&
        !contains(clearRef.current, target) &&
        !contains(chipsContainerRef.current, target) &&
        !contains(inputGroupElement(), target)
      );
    },
  });

  const listNavigation = useListNavigation(floatingRootContext, {
    enabled: () => !readOnly() && !disabled(),
    id: generatedId,
    listRef,
    activeIndex,
    selectedIndex,
    virtual: () => true,
    loopFocus,
    allowEscape: () => loopFocus() && !autoHighlightMode(),
    focusItemOnOpen: () => (queryChangedAfterOpenGet() ? false : 'auto'),
    focusItemOnHover: highlightItemOnHover,
    resetOnPointerLeave: () => !keepHighlight(),
    orientation: () => (grid() ? 'horizontal' : undefined),
    rtl: () => direction() === 'rtl',
    disabledIndices: () => EMPTY_ARRAY as number[],
    grid: grid() ? gridNavigation : undefined,
    onNavigate(nextActiveIndex, event) {
      if ((!event && !open()) || transitionStatus() === 'ending') {
        return;
      }

      if (!event) {
        setIndices({ activeIndex: nextActiveIndex });
      } else {
        setIndices({
          activeIndex: nextActiveIndex,
          type: keyboardActiveRef.current ? 'keyboard' : 'pointer',
        });
      }
    },
  });

  const inputProps = (): HTMLProps =>
    mergeProps(
      resolveThunkProps(listNavigation.reference),
      {
        onKeyDown(event: KeyboardEvent & { preventBaseUIHandler?: () => void }) {
          if (
            grid() &&
            store.state.activeIndex == null &&
            (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
          ) {
            event.preventBaseUIHandler?.();
          }
        },
      },
      dismiss.reference,
      click.reference,
      roleReference(),
    );

  const popupProps = (): HTMLProps =>
    mergeProps(FOCUSABLE_POPUP_PROPS, resolveThunkProps(listNavigation.floating), dismiss.floating, {
      role: 'presentation',
    });

  const itemProps = (): HTMLProps => {
    const listNavigationItemProps = listNavigation.item as HTMLProps | undefined;
    if (!listNavigationItemProps) {
      return EMPTY_OBJECT;
    }
    return { ...listNavigationItemProps, onFocus: undefined };
  };

  createEffect(() => {
    store.update({
      id: generatedId(),
      query: query(),
      filter: filter(),
      items: componentProps.items as StoreState['items'],
      inputValue: inputValue(),
      selectedValue: selectedValue(),
      open: open(),
      mounted: mounted(),
      transitionStatus: transitionStatus(),
      inline: inlineProp(),
      popupProps: popupProps(),
      inputProps: inputProps(),
      triggerProps: interactionTypeProps,
      itemProps: itemProps(),
      openMethod: openMethod(),
      selectionMode: selectionMode(),
      name: name(),
      form: componentProps.form,
      disabled: disabled(),
      readOnly: readOnly(),
      required: required(),
      grid: grid(),
      isGrouped: isGrouped(),
      virtualized: virtualized(),
      openOnInputClick: openOnInputClick(),
      itemToStringLabel: componentProps.itemToStringLabel,
      itemToStringValue: componentProps.itemToStringValue,
      modal: modal(),
      autoHighlight: autoHighlightMode(),
      isItemEqualToValue: isItemEqualToValue(),
      submitOnItemClick: submitOnItemClick(),
      hasInputValue,
      inputOwnsFormValue: inputOwnsFormValue(),
    });
  });

  const inputRefCallback = mergeRefs<HTMLInputElement>(
    (el) => componentProps.inputRef?.(el),
    (el) => validation.registerInput(el),
  );

  const itemsContextValue: ComboboxDerivedItemsContextValue = {
    query,
    hasItems,
    filteredItems,
    flatFilteredItems,
  };

  const serializedValue = createMemo(() => {
    const raw = fieldRawValue();
    if (Array.isArray(raw)) {
      return '';
    }
    return stringifyAsValue(raw, componentProps.itemToStringValue);
  });

  const hasMultipleSelection = () =>
    multiple() && Array.isArray(selectedValue()) && (selectedValue() as any[]).length > 0;
  const hiddenInputName = () =>
    multiple() || inputOwnsFormValue() ? undefined : name();

  function onHiddenInputChange(event: Event) {
    if (event.defaultPrevented || disabled() || readOnly()) {
      return;
    }

    const nextValue = (event.currentTarget as HTMLInputElement).value;
    const nextValueLower = nextValue.toLowerCase();
    const details = createChangeEventDetails(REASONS.none, event);

    const findSerializedMatchIndex = () =>
      valuesRef.current.findIndex(
        (candidate) =>
          stringifyAsValue(candidate, componentProps.itemToStringValue).toLowerCase() ===
            nextValueLower ||
          stringifyAsLabel(candidate, componentProps.itemToStringLabel).toLowerCase() ===
            nextValueLower,
      );

    function handleChange() {
      // Browser autofill only writes a single scalar value.
      if (multiple()) {
        return;
      }

      // INTERNAL: only reachable via `Autocomplete.Root` — the input owns its value directly, so
      // autofill just writes it back verbatim instead of matching against registered items.
      if (selectionMode() === 'none') {
        setInputValue(nextValue, details);
        return;
      }

      let matchingIndex = findSerializedMatchIndex();

      if (matchingIndex === -1) {
        matchingIndex = valuesRef.current.findIndex((_, index) => {
          const renderedLabel = labelsRef.current[index];
          return renderedLabel != null && renderedLabel.toLowerCase() === nextValueLower;
        });
      }

      const matchingValue = matchingIndex === -1 ? undefined : valuesRef.current[matchingIndex];
      if (matchingValue != null) {
        setSelectedValue(matchingValue, details);
      }
    }

    // Only single-selection autofill matches against the registered values/labels. `multiple`
    // ignores autofill and `none` just writes the input value, so avoid the sticky
    // `forceMounted` mount (which never resets) for those modes.
    if (single()) {
      forceMount();
      if (componentProps.items && findSerializedMatchIndex() === -1) {
        store.set('forceMounted', true);
      }
    }
    queueMicrotask(handleChange);
  }

  return (
    <ComboboxRootContext.Provider value={store}>
      <ComboboxFloatingContext.Provider value={floatingRootContext}>
        <ComboboxHasItemsContext.Provider value={hasItems}>
          <ComboboxDerivedItemsContext.Provider value={itemsContextValue}>
            {componentProps.children}
            <input
              {...validation.getValidationProps(disabled(), {
                onFocus() {
                  if (inputInsidePopup()) {
                    triggerElement()?.focus();
                    return;
                  }
                  (inputRef.current || triggerElement())?.focus();
                },
                onChange: onHiddenInputChange,
              })}
              id={generatedId() && hiddenInputName() == null ? `${generatedId()}-hidden-input` : undefined}
              form={componentProps.form}
              name={hiddenInputName()}
              autocomplete={componentProps.formAutoComplete as any}
              disabled={disabled()}
              required={required() && !hasMultipleSelection()}
              readOnly={readOnly()}
              value={serializedValue()}
              ref={inputRefCallback}
              style={hiddenInputName() ? visuallyHiddenInput : visuallyHidden}
              tabIndex={-1}
              aria-hidden="true"
            />
            {multiple() && Array.isArray(selectedValue()) && name()
              ? (selectedValue() as any[]).map((v) => (
                  <input
                    type="hidden"
                    form={componentProps.form}
                    name={name()}
                    value={stringifyAsValue(v, componentProps.itemToStringValue)}
                    disabled={disabled()}
                  />
                ))
              : null}
          </ComboboxDerivedItemsContext.Provider>
        </ComboboxHasItemsContext.Provider>
      </ComboboxFloatingContext.Provider>
    </ComboboxRootContext.Provider>
  );
}

interface ComboboxRootProps<ItemValue, Multiple extends boolean | undefined = false> {
  children?: JSX.Element;
  /**
   * Whether multiple items can be selected.
   * @default false
   */
  multiple?: Multiple | undefined;
  /**
   * Identifies the field when a form is submitted.
   */
  name?: string | undefined;
  /**
   * Identifies the form that owns the internal input.
   */
  form?: string | undefined;
  /**
   * Provides a hint to the browser for autofill on the hidden input element.
   */
  autoComplete?: string | undefined;
  /**
   * The id of the component.
   */
  id?: string | undefined;
  /**
   * Whether the user must choose a value before submitting a form.
   * @default false
   */
  required?: boolean | undefined;
  /**
   * Whether the user should be unable to choose a different option from the popup.
   * @default false
   */
  readOnly?: boolean | undefined;
  /**
   * Whether the component should ignore user interaction.
   * @default false
   */
  disabled?: boolean | undefined;
  /**
   * Whether the popup is initially open.
   * @default false
   */
  defaultOpen?: boolean | undefined;
  /**
   * Whether the popup is currently open. Use when controlled.
   */
  open?: boolean | undefined;
  /**
   * Event handler called when the popup is opened or closed.
   */
  onOpenChange?:
    | ((open: boolean, eventDetails: ComboboxRoot.ChangeEventDetails) => void)
    | undefined;
  /**
   * Event handler called after any animations complete when the popup is opened or closed.
   */
  onOpenChangeComplete?: ((open: boolean) => void) | undefined;
  /**
   * Whether the popup opens when clicking the input.
   * @default true
   */
  openOnInputClick?: boolean | undefined;
  /**
   * Whether the first matching item is highlighted automatically.
   * @default false
   */
  autoHighlight?: boolean | 'always' | undefined;
  /**
   * Whether the highlighted item should be preserved when the pointer leaves the list.
   * @default false
   */
  keepHighlight?: boolean | undefined;
  /**
   * Whether moving the pointer over items should highlight them.
   * @default true
   */
  highlightItemOnHover?: boolean | undefined;
  /**
   * Whether to loop keyboard focus back to the input.
   * @default true
   */
  loopFocus?: boolean | undefined;
  /**
   * The input value of the combobox. Use when controlled.
   */
  inputValue?: string | undefined;
  /**
   * Callback fired when the input value of the combobox changes.
   */
  onInputValueChange?:
    | ((value: string, eventDetails: ComboboxRoot.ChangeEventDetails) => void)
    | undefined;
  /**
   * The uncontrolled input value when initially rendered.
   */
  defaultInputValue?: string | undefined;
  /**
   * Callback fired when an item is highlighted or unhighlighted.
   */
  onItemHighlighted?:
    | ((itemValue: ItemValue | undefined, eventDetails: ComboboxRoot.HighlightEventDetails) => void)
    | undefined;
  /**
   * A ref to the hidden input element.
   */
  inputRef?: ((el: HTMLInputElement) => void) | undefined;
  /**
   * Whether list items are presented in a grid layout.
   * @default false
   */
  grid?: boolean | undefined;
  /**
   * The items to be displayed in the list.
   */
  items?: readonly any[] | readonly Group<any>[] | undefined;
  /**
   * Filtered items to display in the list.
   */
  filteredItems?: readonly any[] | readonly Group<any>[] | undefined;
  /**
   * Filter function used to match items vs input query.
   */
  filter?:
    | null
    | ((itemValue: ItemValue, query: string, itemToString?: (itemValue: ItemValue) => string) => boolean)
    | undefined;
  /**
   * When the item values are objects, converts the value to a string label.
   */
  itemToStringLabel?: ((itemValue: ItemValue) => string) | undefined;
  /**
   * When the item values are objects, converts the value to a string for form submission.
   */
  itemToStringValue?: ((itemValue: ItemValue) => string) | undefined;
  /**
   * Custom comparison logic used to determine if a combobox item value matches the current
   * selected value.
   */
  isItemEqualToValue?: ((itemValue: ItemValue, value: ItemValue) => boolean) | undefined;
  /**
   * The uncontrolled selected value of the combobox when it's initially rendered.
   */
  defaultValue?: ComboboxValueType<ItemValue, Multiple> | null | undefined;
  /**
   * The selected value of the combobox. Use when controlled.
   */
  value?: ComboboxValueType<ItemValue, Multiple> | null | undefined;
  /**
   * Event handler called when the selected value of the combobox changes.
   */
  onValueChange?:
    | ((
        value: ComboboxValueType<ItemValue, Multiple> | (Multiple extends true ? never : null),
        eventDetails: ComboboxRoot.ChangeEventDetails,
      ) => void)
    | undefined;
  /**
   * Whether the items are being externally virtualized.
   * @default false
   */
  virtualized?: boolean | undefined;
  /**
   * Whether the list is rendered inline without using the component's own popup.
   * @default false
   */
  inline?: boolean | undefined;
  /**
   * Determines if the popup enters a modal state when open.
   * @default false
   */
  modal?: boolean | undefined;
  /**
   * The maximum number of items to display in the list.
   * @default -1
   */
  limit?: number | undefined;
  /**
   * Provides a hint to the browser for autofill on the hidden input element.
   */
  formAutoComplete?: string | undefined;
  /**
   * The locale to use for string comparison.
   */
  locale?: Intl.LocalesArgument | undefined;
  /**
   * Whether clicking an item should submit the owning form.
   * @default false
   */
  submitOnItemClick?: boolean | undefined;
  /**
   * @internal Opts the combobox into the "no persisted selection" interaction mode that
   * `Autocomplete.Root` composes on top of this component (mirrors upstream's lower-level
   * `AriaCombobox`'s `selectionMode: 'none'`). Not reachable through `Combobox.Root`'s public API
   * — its `multiple` prop only ever resolves `selectionMode` to `'single'`/`'multiple'`. When set,
   * takes precedence over `multiple`.
   */
  selectionMode?: 'none' | undefined;
  /**
   * @internal Only meaningful when `selectionMode` is `'none'`. Controls whether selecting an item
   * fills the input with its label. Mirrors upstream's `AriaCombobox` `fillInputOnItemPress`.
   * @default true
   */
  fillInputOnItemPress?: boolean | undefined;
  /**
   * @internal Sets the `aria-autocomplete` attribute. Mirrors upstream's `AriaCombobox`
   * `autoComplete` prop, which corresponds to `Autocomplete.Root`'s public `mode` prop.
   * `Combobox.Root` never sets this, so the attribute remains hardcoded to `'list'`.
   * @default 'list'
   */
  autoCompleteMode?: 'list' | 'both' | 'inline' | 'none' | undefined;
}

export interface ComboboxRootState {}

export type ComboboxRootChangeEventReason =
  | typeof REASONS.triggerPress
  | typeof REASONS.outsidePress
  | typeof REASONS.itemPress
  | typeof REASONS.closePress
  | typeof REASONS.escapeKey
  | typeof REASONS.listNavigation
  | typeof REASONS.focusOut
  | typeof REASONS.inputChange
  | typeof REASONS.inputClear
  | typeof REASONS.clearPress
  | typeof REASONS.chipRemovePress
  | typeof REASONS.none;

export type ComboboxRootChangeEventDetails = BaseUIChangeEventDetails<ComboboxRootChangeEventReason>;

export type ComboboxRootHighlightEventReason = 'keyboard' | 'pointer' | 'none';
export type ComboboxRootHighlightEventDetails = BaseUIGenericEventDetails<
  ComboboxRootHighlightEventReason,
  { index: number }
>;

export namespace ComboboxRoot {
  export type Props<Value, Multiple extends boolean | undefined = false> = ComboboxRootProps<
    Value,
    Multiple
  >;
  export type State = ComboboxRootState;
  export type ChangeEventReason = ComboboxRootChangeEventReason;
  export type ChangeEventDetails = ComboboxRootChangeEventDetails;
  export type HighlightEventReason = ComboboxRootHighlightEventReason;
  export type HighlightEventDetails = ComboboxRootHighlightEventDetails;
}
