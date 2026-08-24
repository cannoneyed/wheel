/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createEffect, onMount, splitProps, type JSX } from 'solid-js';
import { mergeRefs } from '../../base-utils/mergeRefs';
import { renderElement } from '../../internals/renderElement';
import type { BaseUIComponentProps } from '../../internals/types';
import {
  useFieldRootContext,
  type FieldRootState,
} from '../../internals/field-root-context/FieldRootContext';
import { registerFieldControl } from '../../internals/field-register-control/registerFieldControl';
import { useFormContext } from '../../internals/form-context/FormContext';
import { useLabelableContext } from '../../internals/labelable-provider/LabelableContext';
import { useLabelableId } from '../../internals/labelable-provider/useLabelableId';
import { fieldValidityMapping } from '../../internals/field-constants/constants';
import {
  createChangeEventDetails,
  type BaseUIChangeEventDetails,
} from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';

/**
 * The form control to label and validate.
 * Renders an `<input>` element.
 *
 * You can omit this part and use any Base UI input component instead. For example,
 * Checkbox, Switch, or Select, among others, will work with Field out of the box.
 *
 * Documentation: [Base UI Field](https://base-ui.com/react/components/field)
 */
interface FieldControlPrivateProps {
  defaultClass?: string | undefined;
  slot?: string | undefined;
}

export function FieldControl(
  componentProps: FieldControl.Props & FieldControlPrivateProps,
): JSX.Element {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'id',
    'name',
    'value',
    'defaultValue',
    'disabled',
    'onValueChange',
    'autofocus',
    'defaultClass',
    'slot',
  ]);

  const { clearErrors } = useFormContext();
  const {
    state: fieldState,
    name: fieldName,
    disabled: fieldDisabled,
    setTouched,
    setDirty,
    validityData,
    setFocused,
    setFilled,
    validationMode,
    validation,
  } = useFieldRootContext();

  const disabled = () => (fieldDisabled() || componentProps.disabled) ?? false;
  const name = () => fieldName() ?? componentProps.name;
  const isControlled = () => componentProps.value !== undefined;

  const { labelId } = useLabelableContext();
  const id = useLabelableId({ id: () => componentProps.id });

  const inputRef: { current: HTMLInputElement | null } = { current: null };
  const handleInputRef = mergeRefs<HTMLInputElement>(
    (el) => {
      inputRef.current = el;
      // Solid has no React-style "defaultValue" DOM special-case (that name
      // is a React invention over the native `value` *content attribute*);
      // set the initial value imperatively once instead, matching what a
      // plain uncontrolled `<input defaultValue>` does.
      if (!isControlled() && componentProps.defaultValue !== undefined) {
        el.value = String(componentProps.defaultValue);
      }
    },
    (el) => validation.registerInput(el),
  );

  // Mirrors upstream's `useIsoLayoutEffect` that syncs `filled` from either
  // the DOM value (uncontrolled, read once the input mounts) or the
  // controlled `value` prop, re-running whenever the controlled value changes.
  createEffect(() => {
    const valueProp = componentProps.value;
    const hasExternalValue = valueProp != null;
    if (inputRef.current?.value || (hasExternalValue && valueProp !== '')) {
      setFilled(true);
    } else if (hasExternalValue && valueProp === '') {
      setFilled(false);
    }
  });

  onMount(() => {
    if (
      componentProps.autofocus &&
      inputRef.current &&
      typeof document !== 'undefined' &&
      inputRef.current === document.activeElement
    ) {
      setFocused(true);
    }
  });

  registerFieldControl(
    inputRef,
    id,
    () => (isControlled() ? componentProps.value : undefined),
    () => inputRef.current?.value,
    () => !disabled(),
    name,
  );

  const state: FieldControl.State = {
    get disabled() {
      return disabled();
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

  const inputProps = () => ({
    id: id(),
    disabled: disabled(),
    name: name(),
    'aria-labelledby': labelId(),
    autofocus: componentProps.autofocus,
    value: isControlled() ? componentProps.value : undefined,
    // Native text inputs only fire `change` on commit (blur/Enter), unlike
    // React's `onChange` which is backed by the `input` event under the
    // hood. Bind to Solid's `onInput` (the real per-keystroke DOM event) to
    // get the same "fires on every keystroke" behavior upstream relies on.
    onInput(event: InputEvent) {
      const input = event.currentTarget as HTMLInputElement;
      const inputValue = input.value;
      componentProps.onValueChange?.(inputValue, createChangeEventDetails(REASONS.none, event));

      // `validation.change` reads validity data, so update dirty before validating.
      setDirty(inputValue !== validityData().initialValue);
      setFilled(inputValue !== '');

      if (!event.defaultPrevented) {
        clearErrors(name());
        validation.change(inputValue);
      }

      // Solid doesn't re-render on every signal read the way React does, so
      // a controlled input whose consumer doesn't update `value` in response
      // won't otherwise "snap back" the way a React controlled input would.
      if (isControlled()) {
        input.value = String(componentProps.value ?? '');
      }
    },
    onFocus() {
      setFocused(true);
    },
    onBlur(event: FocusEvent) {
      setTouched(true);
      setFocused(false);

      if (validationMode() === 'onBlur') {
        validation.commit((event.currentTarget as HTMLInputElement).value);
      }
    },
    onKeyDown(event: KeyboardEvent) {
      if ((event.currentTarget as HTMLElement).tagName === 'INPUT' && event.key === 'Enter') {
        setTouched(true);
        validation.commit((event.currentTarget as HTMLInputElement).value);
      }
    },
  });

  return renderElement('input', componentProps, {
    defaultClass: componentProps.defaultClass ?? 'wheel-Field-Control',
    slot: componentProps.slot ?? 'field-control',
    state,
    ref: handleInputRef,
    props: [
      inputProps,
      elementProps as Record<string, any>,
      (props: Record<string, any>) => validation.getValidationProps(disabled(), props),
    ],
    stateAttributesMapping: fieldValidityMapping,
  });
}

export interface FieldControlState extends FieldRootState {}

export interface FieldControlProps extends BaseUIComponentProps<'input', FieldControlState> {
  /**
   * Callback fired when the `value` changes. Use when controlled.
   */
  onValueChange?: ((value: string, eventDetails: FieldControl.ChangeEventDetails) => void) | undefined;
  /**
   * The default value of the input. Use when uncontrolled.
   */
  defaultValue?: string | number | string[] | undefined;
  /**
   * The value of the input. Use when controlled.
   */
  value?: string | number | string[] | undefined;
}

export type FieldControlChangeEventReason = typeof REASONS.none;
export type FieldControlChangeEventDetails = BaseUIChangeEventDetails<FieldControlChangeEventReason>;

export namespace FieldControl {
  export type Props = FieldControlProps;
  export type State = FieldControlState;
  export type ChangeEventReason = FieldControlChangeEventReason;
  export type ChangeEventDetails = FieldControlChangeEventDetails;
}
