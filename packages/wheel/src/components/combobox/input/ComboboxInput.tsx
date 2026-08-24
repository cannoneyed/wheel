/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-use-signal -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
import { createSignal, splitProps, type JSX } from 'solid-js';
import { platform } from '../../base-utils/platform/index';
import type { BaseUIComponentProps } from '../../internals/types';
import {
  useComboboxDerivedItemsContext,
  useComboboxRootContext,
} from '../root/ComboboxRootContext';
import { triggerStateAttributesMapping } from '../utils/stateAttributesMapping';
import {
  DEFAULT_FIELD_ROOT_CONTEXT,
  FieldRootContext,
  useFieldRootContext,
  type FieldRootState,
} from '../../internals/field-root-context/FieldRootContext';
import { DEFAULT_FIELD_STATE_ATTRIBUTES } from '../../internals/field-constants/constants';
import { useLabelableContext } from '../../internals/labelable-provider/LabelableContext';
import { useComboboxChipsContext } from '../chips/ComboboxChipsContext';
import { stopEvent } from '../../floating-ui-solid';
import { useComboboxPositionerContext } from '../positioner/ComboboxPositionerContext';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import type { Side } from '../../utils/useAnchorPositioning';
import { useDirection } from '../../internals/direction-context/DirectionContext';
import { resolveAriaLabelledBy } from '../../utils/resolveAriaLabelledBy';
import { ComboboxInternalDismissButton } from '../utils/ComboboxInternalDismissButton';
import { createBaseUiId } from '../../internals/createBaseUiId';
import { renderElement } from '../../internals/renderElement';

/**
 * A text input to search for items in the list.
 * Renders an `<input>` element.
 *
 * Documentation: [Base UI Combobox](https://base-ui.com/react/components/combobox)
 */
export function ComboboxInput(componentProps: ComboboxInput.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'disabled',
    'id',
    'value',
  ]);

  const {
    state: fieldState,
    disabled: fieldDisabled,
    setTouched,
    setFocused,
    validationMode,
    validation,
  } = useFieldRootContext();
  const { labelId: fieldLabelId } = useLabelableContext();
  const comboboxChipsContext = useComboboxChipsContext();
  const positioning = useComboboxPositionerContext(true);
  const hasPositionerParent = Boolean(positioning);
  const store = useComboboxRootContext();
  const { filteredItems } = useComboboxDerivedItemsContext();
  const direction = useDirection();

  const required = store.useState('required');
  const comboboxDisabled = store.useState('disabled');
  const readOnly = store.useState('readOnly');
  const name = store.useState('name');
  const form = store.useState('form');
  const selectionMode = store.useState('selectionMode');
  const autoHighlightMode = store.useState('autoHighlight');
  const inputProps = store.useState('inputProps');
  const triggerProps = store.useState('triggerProps');
  const open = store.useState('open');
  const mounted = store.useState('mounted');
  const selectedValue = store.useState('selectedValue');
  const popupSideValue = store.useState('popupSide');
  const positionerElement = store.useState('positionerElement');
  const rootId = store.useState('id');
  const inline = store.useState('inline');
  const modal = store.useState('modal');
  const inputValue = store.useState('inputValue');

  const autoHighlightEnabled = () => Boolean(autoHighlightMode());
  const popupSide = () => (mounted() && positionerElement() ? popupSideValue() : null);
  const disabled = () => (fieldDisabled() || comboboxDisabled() || (local.disabled ?? false)) ?? false;
  const listEmpty = () => filteredItems().length === 0;

  const isInsidePopup = () => hasPositionerParent || inline();
  const focusManagerModal = () => !isInsidePopup() || modal();
  const generatedId = createBaseUiId(() => local.id ?? (!isInsidePopup() ? rootId() : undefined));
  const id = () => local.id ?? generatedId();
  const ariaLabelledBy = () => resolveAriaLabelledBy(fieldLabelId(), undefined);
  const fieldStateForInput = () => (hasPositionerParent ? DEFAULT_FIELD_STATE_ATTRIBUTES : fieldState);

  const [composingValue, setComposingValue] = createSignal<string | null>(null);
  let isComposing = false;
  let lastActiveIndex: number | null = null;
  let shouldRestoreActiveIndex = false;

  const inputOwnsFormValue = () => selectionMode() === 'none' && !hasPositionerParent;

  const setInputElement = (element: HTMLInputElement | null) => {
    const nextIsInsidePopup = hasPositionerParent || store.state.inline;

    if (nextIsInsidePopup && !store.state.hasInputValue) {
      store.context.setInputValue('', createChangeEventDetails(REASONS.none));
    }

    store.update({
      inputElement: element,
      inputInsidePopup: nextIsInsidePopup,
      inputOwnsFormValue: inputOwnsFormValue(),
    });
  };

  const state: ComboboxInputState = {
    get disabled() {
      return disabled();
    },
    get touched() {
      return fieldStateForInput().touched;
    },
    get dirty() {
      return fieldStateForInput().dirty;
    },
    get valid() {
      return fieldStateForInput().valid;
    },
    get filled() {
      return fieldStateForInput().filled;
    },
    get focused() {
      return fieldStateForInput().focused;
    },
    get open() {
      return open();
    },
    get readOnly() {
      return readOnly();
    },
    get popupSide() {
      return popupSide();
    },
    get listEmpty() {
      return listEmpty();
    },
  };

  function handleChipsKeyDown(event: KeyboardEvent, input: HTMLInputElement): number | undefined {
    if (!comboboxChipsContext) {
      return undefined;
    }

    let nextIndex: number | undefined;

    const highlightedChipIndex = comboboxChipsContext.highlightedChipIndex();
    const renderedChipsCount = comboboxChipsContext.chipsRef.current.length;
    const isRtl = direction() === 'rtl';
    const previousChipKey = isRtl ? 'ArrowRight' : 'ArrowLeft';
    const nextChipKey = isRtl ? 'ArrowLeft' : 'ArrowRight';
    const currentSelectedValue: any[] = Array.isArray(selectedValue()) ? selectedValue() : [];

    if (highlightedChipIndex !== undefined) {
      if (event.key === previousChipKey) {
        event.preventDefault();
        nextIndex = highlightedChipIndex > 0 ? highlightedChipIndex - 1 : undefined;
      } else if (event.key === nextChipKey) {
        event.preventDefault();
        nextIndex = highlightedChipIndex < renderedChipsCount - 1 ? highlightedChipIndex + 1 : undefined;
      } else if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        const computedNextIndex =
          highlightedChipIndex >= currentSelectedValue.length - 1
            ? currentSelectedValue.length - 2
            : highlightedChipIndex;
        nextIndex = computedNextIndex >= 0 ? computedNextIndex : undefined;
        store.context.setIndices({ activeIndex: null, selectedIndex: null, type: 'keyboard' });
      }
      return nextIndex;
    }

    if (
      event.key === previousChipKey &&
      (input.selectionStart ?? 0) === 0 &&
      currentSelectedValue.length > 0
    ) {
      event.preventDefault();
      nextIndex = renderedChipsCount > 0 ? renderedChipsCount - 1 : undefined;
    } else if (event.key === 'Backspace' && input.value === '' && currentSelectedValue.length > 0) {
      store.context.setIndices({ activeIndex: null, selectedIndex: null, type: 'keyboard' });
      event.preventDefault();
    }

    return nextIndex;
  }

  // Deferred to a thunk so creation happens inside the Provider branch below —
  // context is resolved at creation time in Solid (see CONVENTIONS.md).
  const element = () =>
    renderElement('input', componentProps, {
    defaultClass: 'wheel-Combobox-Input',
    slot: 'combobox-input',
    state,
    ref: [
      (el: HTMLInputElement | null) => {
        store.context.inputRef.current = el;
      },
      setInputElement,
    ],
    props: [
      inputProps,
      triggerProps,
      () => ({
        value: local.value ?? composingValue() ?? inputValue(),
        'aria-readonly': readOnly() || undefined,
        'aria-required': required() || undefined,
        'aria-labelledby': ariaLabelledBy(),
        disabled: disabled(),
        readOnly: readOnly(),
        required: selectionMode() === 'none' ? required() : undefined,
        form: form(),
        ...(inputOwnsFormValue() && name() ? { name: name() } : {}),
        id: id(),
        onFocus() {
          setFocused(true);

          if (!inline() || !shouldRestoreActiveIndex) {
            return;
          }

          shouldRestoreActiveIndex = false;
          const nextActiveIndex = lastActiveIndex;

          if (
            nextActiveIndex == null ||
            !Object.hasOwn(store.context.valuesRef.current, nextActiveIndex)
          ) {
            return;
          }

          store.context.setIndices({ activeIndex: nextActiveIndex });
        },
        onBlur() {
          setTouched(true);
          setFocused(false);

          const activeIndex = store.state.activeIndex;
          if (inline() && activeIndex !== null && autoHighlightMode() !== 'always') {
            lastActiveIndex = activeIndex;
            shouldRestoreActiveIndex = true;
            store.context.setIndices({ activeIndex: null });
          }

          if (validationMode() === 'onBlur') {
            const valueToValidate = selectionMode() === 'none' ? inputValue() : selectedValue();
            validation.commit(valueToValidate);
          }
        },
        onCompositionStart(event: CompositionEvent) {
          if (platform.os.android) {
            return;
          }
          isComposing = true;
          setComposingValue((event.currentTarget as HTMLInputElement).value);
        },
        onCompositionEnd(event: CompositionEvent) {
          isComposing = false;
          const next = (event.currentTarget as HTMLInputElement).value;
          setComposingValue(null);
          store.context.setInputValue(next, createChangeEventDetails(REASONS.inputChange, event));
        },
        // Deviation: upstream's React `onChange` fires on every keystroke (React's
        // controlled-input semantics map `onChange` to the native `input` event). Solid's
        // `onChange` instead matches native HTML (fires on blur/commit), so the per-keystroke
        // handler here is `onInput` — matching this codebase's established React-`onChange`- to
        // -Solid-`onInput` translation (see `NumberFieldInput.tsx`/`FieldControl.tsx`).
        onInput(event: InputEvent) {
          const target = event.currentTarget as HTMLInputElement;
          const inputType = event.inputType;
          const autofillLikeInput = !inputType || inputType === 'insertReplacementText';
          const shouldOpenOnInput = isComposing || !autofillLikeInput;

          if (isComposing) {
            const nextVal = target.value;
            setComposingValue(nextVal);

            if (nextVal === '' && !store.state.openOnInputClick && !store.state.inputInsidePopup) {
              store.context.setOpen(false, createChangeEventDetails(REASONS.inputClear, event));
            }

            const trimmed = nextVal.trim();
            const shouldMaintainHighlight = autoHighlightEnabled() && trimmed !== '';

            if (!readOnly() && !disabled() && trimmed) {
              if (shouldOpenOnInput) {
                store.context.setOpen(true, createChangeEventDetails(REASONS.inputChange, event));
                if (!autoHighlightEnabled()) {
                  store.context.setIndices({
                    activeIndex: null,
                    selectedIndex: null,
                    type: store.context.keyboardActiveRef.current ? 'keyboard' : 'pointer',
                  });
                }
              }
            }

            if (open() && store.state.activeIndex !== null && !shouldMaintainHighlight) {
              store.context.setIndices({
                activeIndex: null,
                selectedIndex: null,
                type: store.context.keyboardActiveRef.current ? 'keyboard' : 'pointer',
              });
            }

            return;
          }

          const inputChangeDetails = createChangeEventDetails(REASONS.inputChange, event);
          store.context.setInputValue(target.value, inputChangeDetails);

          if (inputChangeDetails.isCanceled) {
            return;
          }

          const empty = target.value === '';
          const clearDetails = createChangeEventDetails(REASONS.inputClear, event);

          if (empty && !store.state.inputInsidePopup) {
            if (selectionMode() === 'single') {
              store.context.setSelectedValue(null, clearDetails);
            }

            if (!store.state.openOnInputClick) {
              store.context.setOpen(false, clearDetails);
            }
          }

          const trimmed = target.value.trim();
          if (!readOnly() && !disabled() && trimmed) {
            if (shouldOpenOnInput) {
              store.context.setOpen(true, createChangeEventDetails(REASONS.inputChange, event));
              if (!autoHighlightEnabled()) {
                store.context.setIndices({
                  activeIndex: null,
                  selectedIndex: null,
                  type: store.context.keyboardActiveRef.current ? 'keyboard' : 'pointer',
                });
              }
            }
          }

          if (open() && store.state.activeIndex !== null && !autoHighlightEnabled()) {
            store.context.setIndices({
              activeIndex: null,
              selectedIndex: null,
              type: store.context.keyboardActiveRef.current ? 'keyboard' : 'pointer',
            });
          }
        },
        onKeyDown(event: KeyboardEvent) {
          if (disabled() || readOnly()) {
            return;
          }

          if (event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) {
            return;
          }

          store.context.keyboardActiveRef.current = true;
          const input = event.currentTarget as HTMLInputElement;
          const scrollAmount = input.scrollWidth - input.clientWidth;
          const isRTL = direction() === 'rtl';

          if (event.key === 'Home') {
            stopEvent(event);
            const cursor = platform.engine.gecko && isRTL ? input.value.length : 0;
            input.setSelectionRange(cursor, cursor);
            input.scrollLeft = 0;
            return;
          }

          if (event.key === 'End') {
            stopEvent(event);
            const cursor = platform.engine.gecko && isRTL ? 0 : input.value.length;
            input.setSelectionRange(cursor, cursor);
            input.scrollLeft = isRTL ? -scrollAmount : scrollAmount;
            return;
          }

          if (!mounted() && event.key === 'Escape') {
            const currentSelectedValue = selectedValue();
            const isClear =
              selectionMode() === 'multiple' && Array.isArray(currentSelectedValue)
                ? currentSelectedValue.length === 0
                : currentSelectedValue === null;

            const details = createChangeEventDetails(REASONS.escapeKey, event);
            const nextValue = selectionMode() === 'multiple' ? [] : null;
            store.context.setInputValue('', details);
            store.context.setSelectedValue(nextValue, details);

            if (!isClear && !store.state.inline && !details.isPropagationAllowed) {
              event.stopPropagation();
            }

            return;
          }

          if (
            comboboxChipsContext &&
            event.key === 'Backspace' &&
            input.value === '' &&
            comboboxChipsContext.highlightedChipIndex() === undefined &&
            Array.isArray(selectedValue()) &&
            selectedValue().length > 0
          ) {
            const renderedChipsCount = comboboxChipsContext.chipsRef.current.length;
            const currentSelectedValue: any[] = selectedValue();
            const removalIndex =
              renderedChipsCount > 0 ? renderedChipsCount - 1 : currentSelectedValue.length - 1;

            const newValue = currentSelectedValue.filter((_, index) => index !== removalIndex);
            store.context.setIndices({
              activeIndex: null,
              selectedIndex: null,
              type: store.context.keyboardActiveRef.current ? 'keyboard' : 'pointer',
            });
            store.context.setSelectedValue(newValue, createChangeEventDetails(REASONS.none, event));
            return;
          }

          const hadHighlightedChip = comboboxChipsContext?.highlightedChipIndex() !== undefined;
          const nextIndex = handleChipsKeyDown(event, input);

          comboboxChipsContext?.setHighlightedChipIndex(nextIndex);

          if (nextIndex !== undefined) {
            comboboxChipsContext?.chipsRef.current[nextIndex]?.focus();
          } else if (hadHighlightedChip) {
            store.context.inputRef.current?.focus();
          }

          if ((event as unknown as { which?: number }).which === 229) {
            return;
          }

          if (event.key === 'Enter' && open()) {
            const activeIndex = store.state.activeIndex;

            if (activeIndex === null) {
              if (inline()) {
                return;
              }

              store.context.setOpen(false, createChangeEventDetails(REASONS.none, event));
              return;
            }

            stopEvent(event);

            const listItem = store.context.listRef.current[activeIndex];

            if (listItem) {
              store.context.selectionEventRef.current = event;
              listItem.click();
              store.context.selectionEventRef.current = null;
            }
          }
        },
        onPointerMove() {
          store.context.keyboardActiveRef.current = false;
        },
        onPointerDown() {
          store.context.keyboardActiveRef.current = false;
        },
      }),
      () => (hasPositionerParent ? elementProps : validation.getValidationProps(disabled(), elementProps)),
    ],
    stateAttributesMapping: triggerStateAttributesMapping,
  });

  const renderedInput = () =>
    hasPositionerParent ? (
      <FieldRootContext.Provider value={DEFAULT_FIELD_ROOT_CONTEXT}>
        {element()}
      </FieldRootContext.Provider>
    ) : (
      element()
    );

  return (
    <>
      {open() && focusManagerModal() && (
        <ComboboxInternalDismissButton
          ref={(el) => {
            store.context.startDismissRef.current = el;
          }}
        />
      )}
      {renderedInput()}
    </>
  );
}

export interface ComboboxInputState extends FieldRootState {
  /**
   * Whether the corresponding popup is open.
   */
  open: boolean;
  /**
   * Indicates which side the corresponding popup is positioned relative to its anchor.
   */
  popupSide: Side | null;
  /**
   * Present when the corresponding items list is empty.
   */
  listEmpty: boolean;
  /**
   * Whether the component should ignore user edits.
   */
  readOnly: boolean;
}

export interface ComboboxInputProps extends BaseUIComponentProps<'input', ComboboxInputState> {
  /**
   * Whether the component should ignore user interaction.
   * @default false
   */
  disabled?: boolean | undefined;
}

export namespace ComboboxInput {
  export type State = ComboboxInputState;
  export type Props = ComboboxInputProps;
}
