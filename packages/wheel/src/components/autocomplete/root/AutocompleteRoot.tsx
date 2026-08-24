/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-use-signal -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createEffect, createMemo, createSignal, splitProps, type JSX } from 'solid-js';
import { ComboboxRoot } from '../../combobox/root/ComboboxRoot';
import { createCoreFilter } from '../../combobox/root/utils/useFilter';
import { stringifyAsLabel } from '../../internals/resolveValueLabel';
import { REASONS } from '../../internals/reasons';

/**
 * Groups all parts of the autocomplete.
 * Doesn't render its own HTML element.
 *
 * Documentation: [Base UI Autocomplete](https://base-ui.com/react/components/autocomplete)
 *
 * Solid port of upstream's `autocomplete/root/AutocompleteRoot.tsx`. Configures the ported
 * `Combobox.Root` for the autocomplete interaction mode: `selectionMode="none"` (the input's typed
 * text is the persisted value — there's no separate "selected value" concept),
 * `fillInputOnItemPress` (selecting an item always fills the input), and `autoCompleteMode` (sets
 * `aria-autocomplete` from `mode`). Those three are internal-only escape hatches added additively
 * to `ComboboxRoot` for exactly this composition (see its class doc comment).
 *
 * The `mode`-driven inline-autocompletion *text mutation* itself (composing a temporary
 * highlighted-item preview into the input while typing, for `mode="both"`/`"inline"`) is handled
 * entirely here, on top of `Combobox.Root`'s already-controlled `inputValue`/`onInputValueChange`
 * — mirroring upstream's `AutocompleteRoot` exactly, which layers this the same way over the
 * lower-level `AriaCombobox`.
 *
 * Deviation: `actionsRef` (imperative `unmount`) is not ported, matching `Combobox.Root`'s
 * equivalent deviation.
 */
export function AutocompleteRoot<ItemValue>(
  componentProps: AutocompleteRoot.Props<ItemValue>,
): JSX.Element {
  const [local, other] = splitProps(componentProps, [
    'openOnInputClick',
    'value',
    'defaultValue',
    'onValueChange',
    'mode',
    'itemToStringValue',
    'onItemHighlighted',
  ]);

  const openOnInputClick = () => local.openOnInputClick ?? false;
  const mode = () => local.mode ?? 'list';
  const enableInline = () => mode() === 'inline' || mode() === 'both';
  const staticItems = () => mode() === 'inline' || mode() === 'none';

  // Mirrors the typed value for uncontrolled usage so we can compose the temporary inline input
  // value on top of it.
  const isControlled = () => local.value !== undefined;
  const [internalValue, setInternalValue] = createSignal(local.defaultValue ?? '');
  const [inlineInputValue, setInlineInputValue] = createSignal('');

  createEffect(() => {
    if (local.value !== undefined) {
      setInlineInputValue('');
    }
  });

  // Composes the input value shown to the user: the inline value takes precedence when present.
  const resolvedInputValue = (): string => {
    if (enableInline() && inlineInputValue() !== '') {
      return inlineInputValue();
    }
    if (isControlled()) {
      return local.value ?? '';
    }
    return internalValue();
  };

  const collator = createCoreFilter();

  const baseFilter = createMemo<Exclude<typeof other.filter, undefined>>(() =>
    other.filter !== undefined ? other.filter : collator.contains,
  );

  const resolvedQuery = createMemo(() => String(isControlled() ? local.value : internalValue()).trim());

  // In "both", wrap filtering to use only the typed value, ignoring the inline value.
  const resolvedFilter = createMemo<typeof other.filter>(() => {
    if (mode() !== 'both') {
      return staticItems() ? null : baseFilter();
    }
    const filterFn = baseFilter();
    if (filterFn === null) {
      return null;
    }
    return (item: any, _query: string, toString?: (itemValue: any) => string) =>
      filterFn(item, resolvedQuery(), toString);
  });

  function handleValueChange(nextValue: string, eventDetails: AutocompleteRoot.ChangeEventDetails) {
    setInlineInputValue('');
    if (!isControlled()) {
      setInternalValue(nextValue);
    }
    local.onValueChange?.(nextValue, eventDetails);
  }

  function handleItemHighlighted(
    highlightedValue: any,
    eventDetails: AutocompleteRoot.HighlightEventDetails,
  ) {
    local.onItemHighlighted?.(highlightedValue, eventDetails);

    if (eventDetails.reason === REASONS.pointer) {
      return;
    }

    if (enableInline()) {
      if (highlightedValue == null) {
        setInlineInputValue('');
      } else {
        setInlineInputValue(stringifyAsLabel(highlightedValue, local.itemToStringValue));
      }
    } else {
      setInlineInputValue('');
    }
  }

  return (
    <ComboboxRoot
      {...other}
      itemToStringLabel={local.itemToStringValue}
      openOnInputClick={openOnInputClick()}
      selectionMode="none"
      fillInputOnItemPress
      filter={resolvedFilter()}
      autoCompleteMode={mode()}
      inputValue={resolvedInputValue()}
      defaultInputValue={local.defaultValue}
      onInputValueChange={handleValueChange}
      onItemHighlighted={handleItemHighlighted}
    />
  );
}

export interface AutocompleteRootState {}

export type AutocompleteRootChangeEventReason = ComboboxRoot.ChangeEventReason;
export type AutocompleteRootChangeEventDetails = ComboboxRoot.ChangeEventDetails;

export type AutocompleteRootHighlightEventReason = ComboboxRoot.HighlightEventReason;
export type AutocompleteRootHighlightEventDetails = ComboboxRoot.HighlightEventDetails;

export interface AutocompleteRootProps<ItemValue>
  extends Omit<
    ComboboxRoot.Props<ItemValue, false>,
    | 'value'
    | 'defaultValue'
    | 'onValueChange'
    | 'itemToStringValue'
    | 'itemToStringLabel'
    | 'isItemEqualToValue'
    | 'selectionMode'
    | 'fillInputOnItemPress'
    | 'autoCompleteMode'
    | 'inputValue'
    | 'defaultInputValue'
    | 'onInputValueChange'
    | 'autoComplete'
    | 'formAutoComplete'
    | 'openOnInputClick'
  > {
  /**
   * Controls how the autocomplete behaves with respect to list filtering and inline autocompletion.
   * - `list` (default): items are dynamically filtered based on the input value. The input value does not change based on the active item.
   * - `both`: items are dynamically filtered based on the input value, which will temporarily change based on the active item (inline autocompletion).
   * - `inline`: items are static (not filtered), and the input value will temporarily change based on the active item (inline autocompletion).
   * - `none`: items are static (not filtered), and the input value will not change based on the active item.
   * @default 'list'
   */
  mode?: 'list' | 'both' | 'inline' | 'none' | undefined;
  /**
   * The uncontrolled input value of the autocomplete when it's initially rendered.
   *
   * To render a controlled autocomplete, use the `value` prop instead.
   */
  defaultValue?: string | undefined;
  /**
   * The input value of the autocomplete. Use when controlled.
   */
  value?: string | undefined;
  /**
   * Event handler called when the input value of the autocomplete changes.
   */
  onValueChange?:
    | ((value: string, eventDetails: AutocompleteRootChangeEventDetails) => void)
    | undefined;
  /**
   * When the item values are objects (`<Autocomplete.Item value={object}>`), this function converts the object value to a string representation for both display in the input and form submission.
   * If the shape of the object is `{ value, label }`, the label will be used automatically without needing to specify this prop.
   */
  itemToStringValue?: ((itemValue: ItemValue) => string) | undefined;
  /**
   * Whether the popup opens when clicking the input.
   * @default false
   */
  openOnInputClick?: boolean | undefined;
}

export namespace AutocompleteRoot {
  export type Props<ItemValue> = AutocompleteRootProps<ItemValue>;
  export type State = AutocompleteRootState;
  export type ChangeEventReason = AutocompleteRootChangeEventReason;
  export type ChangeEventDetails = AutocompleteRootChangeEventDetails;
  export type HighlightEventReason = AutocompleteRootHighlightEventReason;
  export type HighlightEventDetails = AutocompleteRootHighlightEventDetails;
}
