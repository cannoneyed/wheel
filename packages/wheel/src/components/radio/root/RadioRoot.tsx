/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-view-root -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createEffect, onMount, splitProps } from 'solid-js';
import { mergeRefs } from '../../base-utils/mergeRefs';
import { visuallyHidden, visuallyHiddenInput } from '../../base-utils/visuallyHidden';
import { ownerWindow } from '../../base-utils/owner';
import { renderElement } from '../../internals/renderElement';
import type { BaseUIComponentProps, NonNativeButtonProps } from '../../internals/types';
import { createBaseUiId } from '../../internals/createBaseUiId';
import { createButton } from '../../internals/use-button/createButton';
import { ACTIVE_COMPOSITE_ITEM } from '../../internals/composite/constants';
import { CompositeItem } from '../../internals/composite/item/CompositeItem';
import {
  useFieldRootContext,
  type FieldRootState,
} from '../../internals/field-root-context/FieldRootContext';
import { useLabelableContext } from '../../internals/labelable-provider/LabelableContext';
import { useAriaLabelledBy } from '../../internals/labelable-provider/useAriaLabelledBy';
import { useLabelableId } from '../../internals/labelable-provider/useLabelableId';
import { useRadioGroupContext } from '../../radio-group/RadioGroupContext';
import { useFieldItemContext } from '../../field/item/FieldItemContext';
import { serializeValue } from '../../internals/serializeValue';
import { RadioRootContext } from './RadioRootContext';
import { stateAttributesMapping } from '../utils/stateAttributesMapping';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';

/**
 * Represents the radio button itself.
 * Renders a `<span>` element and a hidden `<input>` beside.
 *
 * Documentation: [Base UI Radio](https://base-ui.com/react/components/radio)
 */
export function RadioRoot<Value = any>(componentProps: RadioRoot.Props<Value>) {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'value',
    'disabled',
    'readOnly',
    'required',
    'aria-labelledby',
    'inputRef',
    'nativeButton',
    'id',
  ]);

  const nativeButton = () => componentProps.nativeButton ?? false;

  const groupContext = useRadioGroupContext();
  // Fixed for the component instance's lifetime: a component either renders
  // inside a `<RadioGroup>` provider or it doesn't.
  const isRadioGroup = groupContext !== undefined;

  const {
    setTouched: setFieldTouched,
    setFilled,
    state: fieldState,
    disabled: fieldDisabled,
  } = useFieldRootContext();
  const { labelId } = useLabelableContext();
  const fieldItemContext = useFieldItemContext();

  const disabled = () =>
    (fieldDisabled() ||
      fieldItemContext.disabled() ||
      groupContext?.disabled() ||
      componentProps.disabled) ??
    false;
  const readOnly = () => (groupContext?.readOnly() || componentProps.readOnly) ?? false;
  const required = () => (groupContext?.required() || componentProps.required) ?? false;
  const form = () => groupContext?.form();
  const name = () => groupContext?.name();

  const checked = () =>
    groupContext
      ? groupContext.checkedValue() === componentProps.value
      : (componentProps.value as unknown) === '';

  const radioRef: { current: HTMLElement | null } = { current: null };
  const inputRef: { current: HTMLInputElement | null } = { current: null };

  const handleInputRef = mergeRefs<HTMLInputElement>(
    (el) => {
      inputRef.current = el;
    },
    (el) => componentProps.inputRef?.(el),
    (el) => groupContext?.registerInputRef(el),
  );

  const id = createBaseUiId();
  const controlId = useLabelableId({
    id: () => componentProps.id,
    implicit: false,
    controlRef: radioRef,
  });
  const hiddenInputId = () => (nativeButton() ? undefined : controlId());

  onMount(() => {
    if (inputRef.current?.checked) {
      setFilled(true);
    }
  });

  createEffect(() => {
    const isChecked = checked();
    const isDisabled = disabled();

    if (!inputRef.current) {
      return;
    }

    if (isDisabled && isChecked) {
      groupContext?.registerInputRef(null);
      return;
    }

    if (radioRef.current) {
      groupContext?.registerControlRef(radioRef.current, isDisabled);
    }

    groupContext?.registerInputRef(inputRef.current);
  });

  const ariaLabelledBy = useAriaLabelledBy(() => componentProps['aria-labelledby'], labelId);

  const rootProps = () => ({
    role: 'radio',
    'aria-checked': checked(),
    'aria-required': required() || undefined,
    'aria-readonly': readOnly() || undefined,
    'aria-labelledby': ariaLabelledBy(),
    [ACTIVE_COMPOSITE_ITEM]: checked() ? '' : undefined,
    id: nativeButton() ? controlId() : id(),
    onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Enter') {
        event.preventDefault();
      }
    },
    onClick(event: MouseEvent) {
      if (event.defaultPrevented || disabled() || readOnly()) {
        return;
      }

      event.preventDefault();

      const input = inputRef.current;
      if (!input) {
        return;
      }

      input.dispatchEvent(
        new (ownerWindow(input).PointerEvent)('click', {
          bubbles: true,
          shiftKey: event.shiftKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          metaKey: event.metaKey,
        }),
      );
    },
    onFocus(event: FocusEvent) {
      const groupTouched = groupContext?.touched() ?? false;
      if (event.defaultPrevented || disabled() || readOnly() || !groupTouched) {
        return;
      }

      inputRef.current?.click();

      groupContext?.setTouched(false);
    },
  });

  // Deviation from upstream: Radio.Root doesn't read `getDescriptionProps`
  // (Field.Description isn't ported yet) and doesn't register itself with
  // the Field (upstream doesn't do this either — that's RadioGroup's job).
  const { getButtonProps, buttonRef } = createButton({
    disabled,
    native: nativeButton,
    composite: () => false,
  });

  const props = [
    rootProps,
    elementProps as Record<string, any>,
    getButtonProps,
    (validationProps: Record<string, any>) => {
      const validation = groupContext?.validation;
      return validation ? validation.getValidationProps(disabled(), validationProps) : validationProps;
    },
  ];

  const state: RadioRoot.State = {
    get checked() {
      return checked();
    },
    get disabled() {
      return disabled();
    },
    get readOnly() {
      return readOnly();
    },
    get required() {
      return required();
    },
    get touched() {
      return fieldState.touched;
    },
    get dirty() {
      return fieldState.dirty;
    },
    get valid() {
      return fieldState.valid;
    },
    get filled() {
      return fieldState.filled;
    },
    get focused() {
      return fieldState.focused;
    },
  };

  const internalRefs = [
    (el: HTMLElement) => {
      radioRef.current = el;
      groupContext?.registerControlRef(el, disabled());
    },
    buttonRef,
  ];

  const onInputChange = (event: Event) => {
    if (event.defaultPrevented) {
      return;
    }

    const input = event.currentTarget as HTMLInputElement;

    // Deviation from upstream: React's controlled inputs re-sync the DOM on
    // every render, so upstream doesn't need to. Solid only re-applies
    // `checked` when a tracked dependency changes, so early-return branches
    // that leave state unchanged must undo the native toggle explicitly
    // (same pattern as Switch/Checkbox).
    if (!groupContext || readOnly() || disabled() || componentProps.value === undefined) {
      event.preventDefault();
      input.checked = checked();
      return;
    }

    const details = createChangeEventDetails(REASONS.none, event);

    groupContext.setCheckedValue(componentProps.value, details);

    if (details.isCanceled) {
      input.checked = checked();
      return;
    }

    setFieldTouched(true);
  };

  return (
    <RadioRootContext.Provider value={state}>
      {isRadioGroup ? (
        <CompositeItem
          tag="span"
          // Inside a group this branch renders the part, so it has to carry the
          // same identity the standalone branch below does. Without it a radio
          // in a group had no `data-slot` at all: app CSS targeting
          // `[data-slot="radio-root"]` missed it, and so did the component tree.
          slot="radio-root"
          defaultClass="wheel-Radio-Root"
          as={componentProps.as}
          asChild={componentProps.asChild}
          class={componentProps.class}
          style={componentProps.style}
          children={componentProps.children}
          state={state}
          refs={componentProps.ref ? [...internalRefs, componentProps.ref] : internalRefs}
          props={props}
          stateAttributesMapping={stateAttributesMapping}
        />
      ) : (
        renderElement('span', componentProps, {
          defaultClass: 'wheel-Radio-Root',
          slot: 'radio-root',
          state,
          ref: internalRefs,
          props,
          stateAttributesMapping,
        })
      )}
      <input
        type="radio"
        ref={handleInputRef}
        checked={checked()}
        disabled={disabled()}
        form={form()}
        id={hiddenInputId()}
        name={name()}
        tabIndex={-1}
        style={name() ? visuallyHiddenInput : visuallyHidden}
        aria-hidden="true"
        value={componentProps.value !== undefined ? serializeValue(componentProps.value) : undefined}
        required={required()}
        readOnly={readOnly()}
        onChange={onInputChange}
        onFocus={() => radioRef.current?.focus()}
      />
    </RadioRootContext.Provider>
  );
}

export interface RadioRootState extends FieldRootState {
  /**
   * Whether the radio button is currently selected.
   */
  checked: boolean;
  /**
   * Whether the component should ignore user interaction.
   */
  disabled: boolean;
  /**
   * Whether the user should be unable to select the radio button.
   */
  readOnly: boolean;
  /**
   * Whether the user must choose a value before submitting a form.
   */
  required: boolean;
}

export interface RadioRootProps<Value = any>
  extends NonNativeButtonProps,
    Omit<BaseUIComponentProps<'span', RadioRootState>, 'value'> {
  /**
   * The unique identifying value of the radio in a group.
   */
  value: Value;
  /**
   * The id of the hidden input element.
   * When `nativeButton` is `true`, the id is applied to the root element.
   */
  id?: string | undefined;
  /**
   * Whether the component should ignore user interaction.
   */
  disabled?: boolean | undefined;
  /**
   * Whether the user must choose a value before submitting a form.
   */
  required?: boolean | undefined;
  /**
   * Whether the user should be unable to select the radio button.
   */
  readOnly?: boolean | undefined;
  /**
   * A ref to access the hidden input element.
   */
  inputRef?: ((el: HTMLInputElement) => void) | undefined;
}

export namespace RadioRoot {
  export type State = RadioRootState;
  export type Props<TValue = any> = RadioRootProps<TValue>;
}
