/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-view-root -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createEffect, on, onMount, splitProps, untrack, type JSX } from 'solid-js';
import { createControllableSignal } from '../../base-utils/createControllableSignal';
import { mergeRefs } from '../../base-utils/mergeRefs';
import { EMPTY_ARRAY, EMPTY_OBJECT } from '../../base-utils/empty';
import { visuallyHidden, visuallyHiddenInput } from '../../base-utils/visuallyHidden';
import {
  useClick,
  useDismiss,
  useFloatingRootContext,
  useListNavigation,
  useTypeahead,
} from '../../floating-ui-solid';
import { SelectFloatingContext, SelectRootContext } from './SelectRootContext';
import { useFieldRootContext } from '../../internals/field-root-context/FieldRootContext';
import { registerFieldControl } from '../../internals/field-register-control/registerFieldControl';
import { useLabelableId } from '../../internals/labelable-provider/useLabelableId';
import { createTransitionStatus } from '../../internals/createTransitionStatus';
import { SelectStore, type State as StoreState } from '../store';
import { createChangeEventDetails, type BaseUIChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import { createOpenChangeComplete } from '../../internals/createOpenChangeComplete';
import { useFormContext } from '../../internals/form-context/FormContext';
import { type Group, stringifyAsLabel, stringifyAsValue } from '../../internals/resolveValueLabel';
import {
  compareItemEquality,
  defaultItemEquality,
  findItemIndex,
} from '../../internals/itemEquality';
import { areArraysEqual } from '../../internals/areArraysEqual';
import { createOpenInteractionType } from '../../utils/useOpenInteractionType';
import { getMaxScrollOffset, normalizeScrollOffset } from '../../utils/scrollEdges';
import { FOCUSABLE_POPUP_PROPS } from '../../utils/popups';
import { mergeProps } from '../../merge-props/mergeProps';
import { isElementDisabled } from '../../internals/composite/composite';
import type { HTMLProps } from '../../internals/types';

/**
 * Groups all parts of the select.
 * Doesn't render its own HTML element.
 *
 * Documentation: [Base UI Select](https://base-ui.com/react/components/select)
 *
 * Deviation: upstream also accepts an `actionsRef` (imperative `unmount`) — not ported, matching
 * `Tooltip.Root`'s equivalent deviation (React ref-forwarding pattern with no direct Solid
 * equivalent; `store.set('mounted', false)` remains reachable directly on the store for a future
 * imperative API if needed).
 */
export function SelectRoot<Value, Multiple extends boolean | undefined = false>(
  componentProps: SelectRoot.Props<Value, Multiple>,
): JSX.Element {
  const [, elementProps] = splitProps(componentProps, [
    'children',
    'inputRef',
    'name',
    'form',
    'autoComplete',
    'id',
    'required',
    'readOnly',
    'disabled',
    'multiple',
    'highlightItemOnHover',
    'defaultOpen',
    'onOpenChange',
    'onOpenChangeComplete',
    'open',
    'modal',
    'items',
    'itemToStringLabel',
    'itemToStringValue',
    'isItemEqualToValue',
    'defaultValue',
    'value',
    'onValueChange',
  ]);
  void elementProps;

  const multiple = () => componentProps.multiple ?? false;
  const modal = () => componentProps.modal ?? true;
  const required = () => componentProps.required ?? false;
  const readOnly = () => componentProps.readOnly ?? false;
  const disabledProp = () => componentProps.disabled ?? false;
  const highlightItemOnHover = () => componentProps.highlightItemOnHover ?? true;
  const isItemEqualToValue = () => componentProps.isItemEqualToValue ?? defaultItemEquality;

  const { clearErrors } = useFormContext();
  const {
    setDirty,
    setTouched,
    setFocused,
    validityData,
    setFilled,
    name: fieldName,
    disabled: fieldDisabled,
    validation,
    validationMode,
  } = useFieldRootContext();

  const generatedId = useLabelableId({ id: () => componentProps.id });

  const disabled = () => (fieldDisabled() || disabledProp()) ?? false;
  const name = () => fieldName() ?? componentProps.name;

  const [value, setValueUnwrapped] = createControllableSignal({
    controlled: () => componentProps.value,
    default: multiple() ? ((componentProps.defaultValue as any) ?? EMPTY_ARRAY) : (componentProps.defaultValue ?? null),
    name: 'Select',
    state: 'value',
  });

  const [open, setOpenUnwrapped] = createControllableSignal({
    controlled: () => componentProps.open,
    default: componentProps.defaultOpen ?? false,
    name: 'Select',
    state: 'open',
  });

  const listElements: Array<HTMLElement | null> = [];
  const labelElements: Array<string | null> = [];
  const listRef = { current: listElements };
  const labelsRef = { current: labelElements };
  const popupRef: { current: HTMLDivElement | null } = { current: null };
  const scrollHandlerRef: { current: ((el: HTMLDivElement) => void) | null } = { current: null };
  const scrollArrowsMountedCountRef = { current: 0 };
  const valueRef: { current: HTMLSpanElement | null } = { current: null };
  const valuesRef: { current: Array<any> } = { current: [] };
  const typingRef = { current: false };
  const firstItemTextRef: { current: HTMLElement | null } = { current: null };
  const selectedItemTextRef: { current: HTMLElement | null } = { current: null };
  const selectionRef = {
    current: {
      allowSelectedMouseUp: false,
      allowUnselectedMouseUp: false,
      dragY: 0,
    },
  };
  const alignItemWithTriggerActiveRef = { current: false };
  const initialValueRef = { current: untrack(value) };

  const { mounted, setMounted, transitionStatus } = createTransitionStatus(open);
  const { openMethod, triggerProps: interactionTypeProps } = createOpenInteractionType(open);

  // Initial snapshot only — every one of these fields is kept in sync afterward by the combined
  // `store.update(...)` effect further below, so a single untracked read here (mirroring
  // `TooltipRoot`'s `untrack(() => ({...}))` construction pattern) is intentional, not a missed
  // dependency.
  const store = new SelectStore(
    untrack(() => ({
      id: generatedId(),
      labelId: undefined,
      modal: modal(),
      multiple: multiple(),
      itemToStringLabel: componentProps.itemToStringLabel,
      itemToStringValue: componentProps.itemToStringValue,
      isItemEqualToValue: isItemEqualToValue(),
      value: value(),
      open: open(),
      mounted: mounted(),
      transitionStatus: transitionStatus(),
      items: componentProps.items as StoreState['items'],
      forceMount: false,
      openMethod: null,
      activeIndex: null,
      selectedIndex: null,
      popupProps: EMPTY_OBJECT,
      triggerProps: EMPTY_OBJECT,
      triggerElement: null,
      positionerElement: null,
      listElement: null,
      popupSide: null,
      scrollUpArrowVisible: false,
      scrollDownArrowVisible: false,
      hasScrollArrows: false,
    })),
  );

  const activeIndex = store.useState('activeIndex');
  const selectedIndex = store.useState('selectedIndex');
  const triggerElement = store.useState('triggerElement');
  const positionerElement = store.useState('positionerElement');

  const serializedValue = () => {
    // In multiple mode the shared input is nameless; per-value entries are submitted via
    // `hiddenInputs`. Its value is therefore irrelevant, and passing the whole array to
    // `stringifyAsValue` would invoke a user `itemToStringValue` with an array it doesn't expect.
    if (multiple()) {
      return '';
    }
    return stringifyAsValue(value(), componentProps.itemToStringValue);
  };

  const fieldStringValue = () => {
    const currentValue = value();
    if (multiple() && Array.isArray(currentValue)) {
      return currentValue.map((v) => stringifyAsValue(v, componentProps.itemToStringValue));
    }
    return stringifyAsValue(currentValue, componentProps.itemToStringValue);
  };

  const controlRef: { current: HTMLElement | null } = { current: null };
  createEffect(() => {
    controlRef.current = triggerElement();
  });

  registerFieldControl(controlRef, generatedId, value, fieldStringValue, () => !disabled(), () => componentProps.name);

  const hasSelectedValue = () => {
    const currentValue = value();
    if (multiple()) {
      return Array.isArray(currentValue) && currentValue.length > 0;
    }
    return currentValue != null && stringifyAsValue(currentValue, componentProps.itemToStringValue) !== '';
  };

  onMount(() => {
    setFilled(hasSelectedValue());
  });

  createEffect(() => {
    setFilled(hasSelectedValue());
  });

  // Sync `selectedIndex` from the registered item values whenever the popup is closed. While
  // open, each `SelectItem` sets `selectedIndex` itself as items mount (see `SelectItem.tsx`).
  createEffect(() => {
    const registry = valuesRef.current;
    const currentValue = value();
    const isMultiple = multiple();
    const comparer = isItemEqualToValue();
    let nextIndex: number | null;

    if (isMultiple) {
      const currentArray = Array.isArray(currentValue) ? currentValue : [];
      if (currentArray.length === 0) {
        nextIndex = null;
      } else {
        const lastValue = currentArray[currentArray.length - 1];
        const lastIndex = findItemIndex(registry, lastValue, comparer);
        nextIndex = lastIndex === -1 ? null : lastIndex;
      }
    } else {
      const index = findItemIndex(registry, currentValue, comparer);
      nextIndex = index === -1 ? null : index;
    }

    if (nextIndex === null) {
      selectedItemTextRef.current = null;
    }

    if (open()) {
      return;
    }

    store.set('selectedIndex', nextIndex);
  });

  function isSelectedValueDirty(currentValue: unknown) {
    const initialValue = validityData().initialValue;

    if (Array.isArray(currentValue) && Array.isArray(initialValue)) {
      return !areArraysEqual(currentValue, initialValue, (itemValue, initialItemValue) =>
        compareItemEquality(itemValue, initialItemValue, isItemEqualToValue()),
      );
    }

    return currentValue !== initialValue;
  }

  createEffect(
    on(value, () => {
      clearErrors(name());
      setDirty(isSelectedValueDirty(value()));
      validation.change(value());
    }, { defer: true }),
  );

  const setOpen = (nextOpen: boolean, eventDetails: SelectRoot.ChangeEventDetails) => {
    componentProps.onOpenChange?.(nextOpen, eventDetails);

    if (eventDetails.isCanceled) {
      return;
    }

    setOpenUnwrapped(nextOpen);

    if (
      !nextOpen &&
      (eventDetails.reason === REASONS.focusOut || eventDetails.reason === REASONS.outsidePress)
    ) {
      setTouched(true);
      setFocused(false);

      if (validationMode() === 'onBlur') {
        validation.commit(untrack(value));
      }
    }
  };

  createOpenChangeComplete({
    open,
    getElement: () => popupRef.current,
    onComplete() {
      if (!open()) {
        setMounted(false);
        store.update({ activeIndex: null, openMethod: null });
        componentProps.onOpenChangeComplete?.(false);
      }
    },
  });

  const setValue = (nextValue: any, eventDetails: SelectRoot.ChangeEventDetails) => {
    componentProps.onValueChange?.(nextValue, eventDetails);

    if (eventDetails.isCanceled) {
      return;
    }

    setValueUnwrapped(nextValue);
  };

  const handleScrollArrowVisibility = () => {
    const scroller = store.state.listElement || popupRef.current;
    if (!scroller) {
      return;
    }

    const maxScrollTop = getMaxScrollOffset(scroller.scrollHeight, scroller.clientHeight);
    const scrollTop = normalizeScrollOffset(scroller.scrollTop, maxScrollTop);
    const shouldShowUp = scrollTop > 0;
    const shouldShowDown = scrollTop < maxScrollTop;

    if (store.state.scrollUpArrowVisible !== shouldShowUp) {
      store.set('scrollUpArrowVisible', shouldShowUp);
    }
    if (store.state.scrollDownArrowVisible !== shouldShowDown) {
      store.set('scrollDownArrowVisible', shouldShowDown);
    }
  };

  const floatingContext = useFloatingRootContext({
    open,
    onOpenChange: setOpen as (open: boolean, eventDetails: BaseUIChangeEventDetails<string>) => void,
    elements: {
      reference: triggerElement,
      floating: positionerElement,
    },
  });

  const click = useClick(floatingContext, {
    enabled: () => !readOnly() && !disabled(),
    event: () => 'mousedown',
  });

  const dismiss = useDismiss(floatingContext);

  const listNavigation = useListNavigation(floatingContext, {
    enabled: () => !readOnly() && !disabled(),
    listRef,
    activeIndex,
    selectedIndex,
    disabledIndices: EMPTY_ARRAY as number[],
    onNavigate(nextActiveIndex) {
      // Retain the highlight while transitioning out.
      if (nextActiveIndex === null && !open()) {
        return;
      }

      store.set('activeIndex', nextActiveIndex);
    },
    focusItemOnHover: highlightItemOnHover,
  });

  const typeahead = useTypeahead(floatingContext, {
    enabled: () => !readOnly() && !disabled() && (open() || !multiple()),
    listRef: labelsRef,
    activeIndex,
    selectedIndex,
    // Skip disabled items while matching so typeahead advances to the next selectable item.
    // Arity-1 predicate (not a zero-arg accessor) — see `accessDisabledIndices`'s disambiguation.
    disabledIndices: (index: number) => isElementDisabled(listRef.current[index]),
    onMatch(index) {
      if (open()) {
        store.set('activeIndex', index);
      } else {
        setValue(valuesRef.current[index], createChangeEventDetails(REASONS.none));
      }
    },
    onTyping(typing) {
      typingRef.current = typing;
    },
  });

  // `listNavigation.reference`/`.floating` are reactive zero-arg thunks (see
  // `useListNavigation`'s doc comment), unlike every other hook's `reference`/`floating`, which
  // are plain objects. The shared `mergeProps` utility treats *any* function argument as an
  // upstream-`getButtonProps`-style "props getter" (calling it with the accumulated props and
  // using its return value verbatim) rather than a value to merge — so an un-invoked thunk here
  // would silently discard everything merged before it. They must be invoked explicitly so
  // `mergeProps` always receives plain objects.
  //
  // Cast note: the shared `ElementProps` type (`floating-ui-solid/types.ts`) declares
  // `reference`/`floating` as plain `HTMLProps`, not accounting for hooks (like
  // `useListNavigation`) that return a reactive thunk for these fields — so the static type
  // doesn't have a call signature even though the runtime value here does.
  const resolveThunkProps = (value: unknown): HTMLProps =>
    typeof value === 'function' ? (value as () => HTMLProps)() : (value as HTMLProps);

  const mergedTriggerProps = () => {
    const triggerInteractionProps = mergeProps(
      typeahead.reference,
      resolveThunkProps(listNavigation.reference),
      dismiss.reference,
      click.reference,
      interactionTypeProps,
    );

    const currentId = generatedId();
    if (currentId) {
      (triggerInteractionProps as any).id = currentId;
    }

    return triggerInteractionProps;
  };

  const popupProps = () =>
    mergeProps(
      FOCUSABLE_POPUP_PROPS,
      typeahead.floating,
      resolveThunkProps(listNavigation.floating),
      dismiss.floating,
    );

  const itemProps = () => (listNavigation.item as Record<string, any> | undefined) ?? EMPTY_OBJECT;

  createEffect(() => {
    store.update({
      id: generatedId(),
      modal: modal(),
      multiple: multiple(),
      value: value(),
      open: open(),
      mounted: mounted(),
      transitionStatus: transitionStatus(),
      popupProps: popupProps(),
      triggerProps: mergedTriggerProps(),
      items: componentProps.items as StoreState['items'],
      itemToStringLabel: componentProps.itemToStringLabel,
      itemToStringValue: componentProps.itemToStringValue,
      isItemEqualToValue: isItemEqualToValue(),
      openMethod: openMethod(),
    });
  });

  const contextValue: SelectRootContext = {
    store,
    name,
    required,
    disabled,
    readOnly,
    multiple,
    highlightItemOnHover,
    setValue,
    setOpen,
    listRef,
    labelsRef,
    popupRef,
    scrollHandlerRef,
    handleScrollArrowVisibility,
    scrollArrowsMountedCountRef,
    // Getter so `SelectItem.tsx`'s reads stay reactive to `listNavigation.item`'s identity
    // (stable in practice, but this mirrors upstream's per-render `itemProps` recomputation).
    get itemProps() {
      return itemProps();
    },
    valueRef,
    valuesRef,
    typingRef,
    selectionRef,
    firstItemTextRef,
    selectedItemTextRef,
    validation,
    // Wrapper (not a direct snapshot of `componentProps.onOpenChangeComplete`) so a later change
    // to the prop is still observed when this is eventually invoked, matching `TooltipRoot`'s
    // `store.context.onOpenChangeComplete = (open) => props.onOpenChangeComplete?.(open)` pattern.
    onOpenChangeComplete: (nextOpen: boolean) => componentProps.onOpenChangeComplete?.(nextOpen),
    alignItemWithTriggerActiveRef,
    initialValueRef,
  };

  const inputRef = mergeRefs<HTMLInputElement>(
    (el) => componentProps.inputRef?.(el),
    (el) => validation.registerInput(el),
  );

  const hasMultipleSelection = () => multiple() && Array.isArray(value()) && (value() as any[]).length > 0;
  const hiddenInputName = () => (multiple() ? undefined : name());

  function onHiddenInputChange(event: Event) {
    if (event.defaultPrevented || disabled() || readOnly()) {
      return;
    }

    const nextValue = (event.currentTarget as HTMLInputElement).value;
    const details = createChangeEventDetails(REASONS.none, event);

    function handleChange() {
      if (multiple()) {
        return;
      }

      const nextValueLower = nextValue.toLowerCase();
      let matchingIndex = valuesRef.current.findIndex(
        (candidate) =>
          stringifyAsValue(candidate, componentProps.itemToStringValue).toLowerCase() === nextValueLower ||
          stringifyAsLabel(candidate, componentProps.itemToStringLabel).toLowerCase() === nextValueLower,
      );

      if (matchingIndex === -1) {
        matchingIndex = valuesRef.current.findIndex((_, index) => {
          const renderedLabel = labelsRef.current[index];
          return renderedLabel != null && renderedLabel.toLowerCase() === nextValueLower;
        });
      }

      const matchingValue = matchingIndex === -1 ? undefined : valuesRef.current[matchingIndex];
      if (matchingValue != null) {
        setValue(matchingValue, details);
      }
    }

    store.set('forceMount', true);
    queueMicrotask(handleChange);
  }

  return (
    <SelectRootContext.Provider value={contextValue}>
      <SelectFloatingContext.Provider value={floatingContext}>
        {componentProps.children}
        <input
          {...validation.getValidationProps(disabled(), {
            onFocus() {
              store.state.triggerElement?.focus();
            },
            onChange: onHiddenInputChange,
          })}
          id={generatedId() && hiddenInputName() == null ? `${generatedId()}-hidden-input` : undefined}
          form={componentProps.form}
          name={hiddenInputName()}
          autocomplete={componentProps.autoComplete as any}
          value={serializedValue()}
          disabled={disabled()}
          required={required() && !hasMultipleSelection()}
          readOnly={readOnly()}
          ref={inputRef}
          style={name() ? visuallyHiddenInput : visuallyHidden}
          tabIndex={-1}
          aria-hidden="true"
        />
        {multiple() && Array.isArray(value()) && name()
          ? (value() as any[]).map((v) => (
              <input
                type="hidden"
                form={componentProps.form}
                name={name()}
                value={stringifyAsValue(v, componentProps.itemToStringValue)}
                disabled={disabled()}
              />
            ))
          : null}
      </SelectFloatingContext.Provider>
    </SelectRootContext.Provider>
  );
}

type SelectValueType<Value, Multiple extends boolean | undefined> = Multiple extends true
  ? Value[]
  : Value;

export interface SelectRootState {}

export interface SelectRootProps<Value, Multiple extends boolean | undefined = false> {
  children?: JSX.Element;
  /**
   * A ref to access the hidden input element.
   */
  inputRef?: ((el: HTMLInputElement) => void) | undefined;
  /**
   * Identifies the field when a form is submitted.
   */
  name?: string | undefined;
  /**
   * Identifies the form that owns the hidden input.
   * Useful when the select is rendered outside the form.
   */
  form?: string | undefined;
  /**
   * Provides a hint to the browser for autofill.
   */
  autoComplete?: string | undefined;
  /**
   * The id of the Select.
   */
  id?: string | undefined;
  /**
   * Whether the user must choose a value before submitting a form.
   * @default false
   */
  required?: boolean | undefined;
  /**
   * Whether the user should be unable to choose a different option from the select popup.
   * @default false
   */
  readOnly?: boolean | undefined;
  /**
   * Whether the component should ignore user interaction.
   * @default false
   */
  disabled?: boolean | undefined;
  /**
   * Whether multiple items can be selected.
   * @default false
   */
  multiple?: Multiple | undefined;
  /**
   * Whether moving the pointer over items should highlight them.
   * @default true
   */
  highlightItemOnHover?: boolean | undefined;
  /**
   * Whether the select popup is initially open.
   * @default false
   */
  defaultOpen?: boolean | undefined;
  /**
   * Event handler called when the select popup is opened or closed.
   */
  onOpenChange?: ((open: boolean, eventDetails: SelectRootChangeEventDetails) => void) | undefined;
  /**
   * Event handler called after any animations complete when the select popup is opened or closed.
   */
  onOpenChangeComplete?: ((open: boolean) => void) | undefined;
  /**
   * Whether the select popup is currently open.
   */
  open?: boolean | undefined;
  /**
   * Determines if the select enters a modal state when open.
   * @default true
   */
  modal?: boolean | undefined;
  /**
   * Data structure of the items rendered in the select popup.
   */
  items?:
    | Record<string, JSX.Element>
    | ReadonlyArray<{ label: JSX.Element; value: any }>
    | ReadonlyArray<Group<any>>
    | undefined;
  /**
   * When the item values are objects, this function converts the object value to a string
   * representation for display in the trigger.
   */
  itemToStringLabel?: ((itemValue: Value) => string) | undefined;
  /**
   * When the item values are objects, this function converts the object value to a string
   * representation for form submission.
   */
  itemToStringValue?: ((itemValue: Value) => string) | undefined;
  /**
   * Custom comparison logic used to determine if a select item value matches the current
   * selected value.
   */
  isItemEqualToValue?: ((itemValue: Value, value: Value) => boolean) | undefined;
  /**
   * The uncontrolled value of the select when it's initially rendered.
   */
  defaultValue?: SelectValueType<Value, Multiple> | null | undefined;
  /**
   * The value of the select. Use when controlled.
   */
  value?: SelectValueType<Value, Multiple> | null | undefined;
  /**
   * Event handler called when the value of the select changes.
   */
  onValueChange?:
    | ((
        value: SelectValueType<Value, Multiple> | (Multiple extends true ? never : null),
        eventDetails: SelectRootChangeEventDetails,
      ) => void)
    | undefined;
}

export interface SelectRootActions {
  unmount: () => void;
}

export type SelectRootChangeEventReason =
  | typeof REASONS.triggerPress
  | typeof REASONS.outsidePress
  | typeof REASONS.escapeKey
  | typeof REASONS.windowResize
  | typeof REASONS.itemPress
  | typeof REASONS.focusOut
  | typeof REASONS.listNavigation
  | typeof REASONS.cancelOpen
  | typeof REASONS.none;

export type SelectRootChangeEventDetails = BaseUIChangeEventDetails<SelectRootChangeEventReason>;

export namespace SelectRoot {
  export type Props<Value, Multiple extends boolean | undefined = false> = SelectRootProps<
    Value,
    Multiple
  >;
  export type State = SelectRootState;
  export type Actions = SelectRootActions;
  export type ChangeEventReason = SelectRootChangeEventReason;
  export type ChangeEventDetails = SelectRootChangeEventDetails;
}
