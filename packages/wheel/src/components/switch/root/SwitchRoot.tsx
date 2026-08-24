/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-view-root -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createEffect, on, onMount, splitProps, Show } from 'solid-js';
import { createControllableSignal } from '../../base-utils/createControllableSignal';
import { mergeRefs } from '../../base-utils/mergeRefs';
import { visuallyHidden, visuallyHiddenInput } from '../../base-utils/visuallyHidden';
import { ownerWindow } from '../../base-utils/owner';
import { renderElement } from '../../internals/renderElement';
import type { BaseUIComponentProps, NonNativeButtonProps } from '../../internals/types';
import { createBaseUiId } from '../../internals/createBaseUiId';
import { createButton } from '../../internals/use-button/createButton';
import { SwitchRootContext } from './SwitchRootContext';
import { stateAttributesMapping } from '../stateAttributesMapping';
import {
  useFieldRootContext,
  type FieldRootState,
} from '../../internals/field-root-context/FieldRootContext';
import { registerFieldControl } from '../../internals/field-register-control/registerFieldControl';
import { useFormContext } from '../../internals/form-context/FormContext';
import { useLabelableContext } from '../../internals/labelable-provider/LabelableContext';
import { useAriaLabelledBy } from '../../internals/labelable-provider/useAriaLabelledBy';
import { useLabelableId } from '../../internals/labelable-provider/useLabelableId';
import {
  createChangeEventDetails,
  type BaseUIChangeEventDetails,
} from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';

/**
 * Represents the switch itself.
 * Renders a `<span>` element and a hidden `<input>` beside.
 *
 * Documentation: [Base UI Switch](https://base-ui.com/react/components/switch)
 */
export function SwitchRoot(componentProps: SwitchRoot.Props) {
  const [, elementProps] = splitProps(componentProps, [
    'checked',
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'defaultChecked',
    'aria-labelledby',
    'form',
    'id',
    'inputRef',
    'name',
    'nativeButton',
    'onCheckedChange',
    'readOnly',
    'required',
    'disabled',
    'uncheckedValue',
    'value',
  ]);

  const nativeButton = () => componentProps.nativeButton ?? false;
  const readOnly = () => componentProps.readOnly ?? false;
  const required = () => componentProps.required ?? false;

  const { clearErrors } = useFormContext();
  const fieldContext = useFieldRootContext();
  const {
    state: fieldState,
    setTouched,
    setDirty,
    validityData,
    setFilled,
    setFocused,
    validationMode,
    disabled: fieldDisabled,
    name: fieldName,
    validation,
  } = fieldContext;
  const { labelId } = useLabelableContext();

  const disabled = () => (fieldDisabled() || componentProps.disabled) ?? false;
  const name = () => fieldName() ?? componentProps.name;

  const inputRef: { current: HTMLInputElement | null } = { current: null };
  const handleInputRef = mergeRefs<HTMLInputElement>(
    (el) => {
      inputRef.current = el;
    },
    (el) => componentProps.inputRef?.(el),
    (el) => validation.registerInput(el),
  );

  const switchRef: { current: HTMLButtonElement | null } = { current: null };

  const id = createBaseUiId();

  const controlId = useLabelableId({
    id: () => componentProps.id,
    implicit: false,
    controlRef: switchRef,
  });
  const hiddenInputId = () => (nativeButton() ? undefined : controlId());

  const [checked, setCheckedState] = createControllableSignal({
    controlled: () => componentProps.checked,
    default: Boolean(componentProps.defaultChecked),
    name: 'Switch',
    state: 'checked',
  });

  registerFieldControl(switchRef, id, checked, undefined, () => !disabled(), name);

  onMount(() => {
    if (inputRef.current) {
      setFilled(inputRef.current.checked);
    }
  });

  createEffect(
    on(checked, () => {
      clearErrors(name());
      setDirty(checked() !== validityData().initialValue);
      setFilled(checked());

      validation.change(checked());
    }, { defer: true }),
  );

  const { getButtonProps, buttonRef } = createButton({
    disabled,
    native: nativeButton,
  });

  const ariaLabelledBy = useAriaLabelledBy(
    () => componentProps['aria-labelledby'],
    labelId,
    inputRef,
    () => !nativeButton(),
    hiddenInputId,
  );

  const rootProps = () => ({
    id: nativeButton() ? controlId() : id(),
    role: 'switch',
    'aria-checked': checked(),
    'aria-readonly': readOnly() || undefined,
    'aria-required': required() || undefined,
    'aria-labelledby': ariaLabelledBy(),
    onFocus() {
      if (!disabled()) {
        setFocused(true);
      }
    },
    onBlur() {
      const element = inputRef.current;
      if (!element || disabled()) {
        return;
      }

      setTouched(true);
      setFocused(false);

      if (validationMode() === 'onBlur') {
        validation.commit(element.checked);
      }
    },
    onClick(event: MouseEvent) {
      if (readOnly() || disabled()) {
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
  });

  const onInputChange = (event: Event) => {
    if (event.defaultPrevented) {
      return;
    }

    const input = event.currentTarget as HTMLInputElement;

    if (readOnly()) {
      event.preventDefault();
      input.checked = checked();
      return;
    }

    const nextChecked = input.checked;
    const eventDetails = createChangeEventDetails(REASONS.none, event);

    componentProps.onCheckedChange?.(nextChecked, eventDetails);

    if (eventDetails.isCanceled) {
      // Unlike React, the DOM input already flipped; resync it with state.
      input.checked = checked();
      return;
    }

    setCheckedState(nextChecked);
  };

  const state: SwitchRoot.State = {
    get disabled() {
      return disabled();
    },
    get checked() {
      return checked();
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

  return (
    <SwitchRootContext.Provider value={state}>
      {renderElement('span', componentProps, {
        defaultClass: 'wheel-Switch-Root',
        slot: 'switch-root',
        state,
        ref: [
          (el: HTMLButtonElement) => {
            switchRef.current = el;
          },
          buttonRef,
        ],
        props: [
          rootProps,
          elementProps as Record<string, any>,
          getButtonProps,
          (props: Record<string, any>) => validation.getValidationProps(disabled(), props),
        ],
        stateAttributesMapping,
      })}
      <Show when={!checked() && name() && componentProps.uncheckedValue !== undefined}>
        <input
          type="hidden"
          form={componentProps.form}
          name={name()}
          value={componentProps.uncheckedValue as string | number}
          disabled={disabled()}
        />
      </Show>
      <input
        type="checkbox"
        ref={handleInputRef}
        checked={checked()}
        disabled={disabled()}
        form={componentProps.form}
        id={hiddenInputId()}
        name={name()}
        required={required()}
        style={name() ? visuallyHiddenInput : visuallyHidden}
        tabIndex={-1}
        aria-hidden="true"
        value={componentProps.value !== undefined ? componentProps.value : undefined}
        onChange={onInputChange}
        onFocus={() => switchRef.current?.focus()}
      />
    </SwitchRootContext.Provider>
  );
}

export interface SwitchRootState extends FieldRootState {
  /**
   * Whether the switch is currently active.
   */
  checked: boolean;
  /**
   * Whether the component should ignore user interaction.
   */
  disabled: boolean;
  /**
   * Whether the user should be unable to activate or deactivate the switch.
   */
  readOnly: boolean;
  /**
   * Whether the user must activate the switch before submitting a form.
   */
  required: boolean;
}

export interface SwitchRootProps
  extends NonNativeButtonProps,
    Omit<BaseUIComponentProps<'span', SwitchRootState>, 'onChange'> {
  /**
   * The id of the hidden input element.
   * When `nativeButton` is `true`, the id is applied to the root element.
   */
  id?: string | undefined;
  /**
   * Whether the switch is currently active.
   * To render an uncontrolled switch, use the `defaultChecked` prop instead.
   */
  checked?: boolean | undefined;
  /**
   * Whether the switch is initially active.
   * To render a controlled switch, use the `checked` prop instead.
   * @default false
   */
  defaultChecked?: boolean | undefined;
  /**
   * Whether the component should ignore user interaction.
   * @default false
   */
  disabled?: boolean | undefined;
  /**
   * The `form` attribute of the hidden `<input>`.
   */
  form?: string | undefined;
  /**
   * A ref to access the hidden `<input>` element.
   */
  inputRef?: ((el: HTMLInputElement) => void) | undefined;
  /**
   * Identifies the field when a form is submitted.
   */
  name?: string | undefined;
  /**
   * Callback fired when the switch is activated or deactivated.
   */
  onCheckedChange?:
    | ((checked: boolean, eventDetails: SwitchRoot.ChangeEventDetails) => void)
    | undefined;
  /**
   * Whether the user should be unable to activate or deactivate the switch.
   * @default false
   */
  readOnly?: boolean | undefined;
  /**
   * Whether the user must activate the switch before submitting a form.
   * @default false
   */
  required?: boolean | undefined;
  /**
   * The value submitted with the form when the switch is off.
   */
  uncheckedValue?: string | number | undefined;
  /**
   * The value submitted with the form when the switch is on.
   */
  value?: string | number | undefined;
}

export type SwitchRootChangeEventReason = typeof REASONS.none;
export type SwitchRootChangeEventDetails = BaseUIChangeEventDetails<SwitchRootChangeEventReason>;

export namespace SwitchRoot {
  export type Props = SwitchRootProps;
  export type State = SwitchRootState;
  export type ChangeEventReason = SwitchRootChangeEventReason;
  export type ChangeEventDetails = SwitchRootChangeEventDetails;
}
