/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-view-root -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createEffect, on, onCleanup, onMount, splitProps, Show } from 'solid-js';
import { createControllableSignal } from '../../base-utils/createControllableSignal';
import { mergeRefs } from '../../base-utils/mergeRefs';
import { visuallyHidden, visuallyHiddenInput } from '../../base-utils/visuallyHidden';
import { ownerWindow } from '../../base-utils/owner';
import { getDefaultFormSubmitter } from '../../base-utils/getDefaultFormSubmitter';
import { renderElement } from '../../internals/renderElement';
import type { BaseUIComponentProps, BaseUIEvent, NonNativeButtonProps } from '../../internals/types';
import { createBaseUiId } from '../../internals/createBaseUiId';
import { createButton } from '../../internals/use-button/createButton';
import { CheckboxRootContext } from './CheckboxRootContext';
import { checkboxStateAttributesMapping } from '../utils/stateAttributesMapping';
import {
  useFieldRootContext,
  type FieldRootState,
} from '../../internals/field-root-context/FieldRootContext';
import { registerFieldControl } from '../../internals/field-register-control/registerFieldControl';
import { useFormContext } from '../../internals/form-context/FormContext';
import { useLabelableContext } from '../../internals/labelable-provider/LabelableContext';
import { useAriaLabelledBy } from '../../internals/labelable-provider/useAriaLabelledBy';
import { useLabelableId } from '../../internals/labelable-provider/useLabelableId';
import { useCheckboxGroupContext } from '../../checkbox-group/CheckboxGroupContext';
import { useFieldItemContext } from '../../field/item/FieldItemContext';
import {
  createChangeEventDetails,
  type BaseUIChangeEventDetails,
} from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';

export const PARENT_CHECKBOX = 'data-parent';

/**
 * Represents the checkbox itself.
 * Renders a `<span>` element and a hidden `<input>` beside.
 *
 * Documentation: [Base UI Checkbox](https://base-ui.com/react/components/checkbox)
 */
export function CheckboxRoot(componentProps: CheckboxRoot.Props) {
  const [, elementProps] = splitProps(componentProps, [
    'checked',
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'defaultChecked',
    'aria-labelledby',
    'disabled',
    'form',
    'id',
    'indeterminate',
    'inputRef',
    'name',
    'nativeButton',
    'onCheckedChange',
    'parent',
    'readOnly',
    'required',
    'uncheckedValue',
    'value',
  ]);

  const nativeButton = () => componentProps.nativeButton ?? false;
  const readOnly = () => componentProps.readOnly ?? false;
  const required = () => componentProps.required ?? false;
  const isParent = () => componentProps.parent ?? false;

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
    validation: localValidation,
  } = fieldContext;
  const { labelId } = useLabelableContext();

  const groupContext = useCheckboxGroupContext();
  const parentContext = groupContext?.parent;
  // Whether this checkbox lives in a `CheckboxGroup` that declared `allValues`
  // (i.e. is set up for a parent/child tri-state checkbox). A plain child
  // inside a group without `allValues` still derives its checked state from
  // the group's `value`, but doesn't participate in parent cascading.
  const isGroupedWithParent = () =>
    groupContext !== undefined && groupContext.allValues() !== undefined;

  const validation = () => groupContext?.validation ?? localValidation;

  const fieldItemContext = useFieldItemContext();

  const disabled = () =>
    (fieldDisabled() ||
      fieldItemContext.disabled() ||
      groupContext?.disabled() ||
      componentProps.disabled) ??
    false;
  const name = () => fieldName() ?? componentProps.name;
  const value = () => componentProps.value ?? name();

  const groupValue = () => groupContext?.value();
  const defaultGroupValue = groupContext?.defaultValue;

  const inputRef: { current: HTMLInputElement | null } = { current: null };
  const handleInputRef = mergeRefs<HTMLInputElement>(
    (el) => {
      inputRef.current = el;
    },
    (el) => componentProps.inputRef?.(el),
    (el) => validation().registerInput(el),
  );

  const checkboxRef: { current: HTMLButtonElement | null } = { current: null };

  const id = createBaseUiId();
  const parentId = createBaseUiId();

  const controlId = useLabelableId({
    id: () => componentProps.id,
    implicit: false,
    controlRef: checkboxRef,
  });
  // Child checkboxes in a parent-enabled group get a predictable id
  // (`${parentId}-${value}`) so the parent's `aria-controls` can reference
  // them; the parent checkbox itself uses its own generated id.
  const inputId = () => {
    if (isGroupedWithParent()) {
      return isParent() ? parentId() : `${parentContext!.id()}-${value()}`;
    }
    return controlId();
  };
  const hiddenInputId = () => (nativeButton() ? undefined : inputId());

  // Resolves this checkbox's group-derived props (`checked`/`indeterminate`/
  // `onCheckedChange`) once it's known whether the surrounding group declared
  // `allValues`. Empty outside a parent-enabled group.
  const groupProps = (): Record<string, any> => {
    if (!isGroupedWithParent()) {
      return {};
    }
    if (isParent()) {
      return groupContext!.parent.getParentProps();
    }
    const v = value();
    if (v) {
      return groupContext!.parent.getChildProps(v);
    }
    return {};
  };

  const groupChecked = () => groupProps().checked ?? componentProps.checked;
  const groupIndeterminate = () => groupProps().indeterminate ?? indeterminate();
  const groupOnChange = ():
    | ((next: boolean, details: BaseUIChangeEventDetails<any>) => void)
    | undefined => groupProps().onCheckedChange;
  const otherGroupProps = () => {
    const { checked: _checked, indeterminate: _indeterminate, onCheckedChange: _onCheckedChange, ...rest } =
      groupProps();
    return rest;
  };

  const [checked, setCheckedState] = createControllableSignal({
    controlled: () => {
      const v = value();
      const gv = groupValue();
      if (v && gv && !isParent()) {
        return gv.includes(v);
      }
      return groupChecked();
    },
    default: (() => {
      const v = value();
      if (v && defaultGroupValue && !isParent()) {
        return defaultGroupValue.includes(v);
      }
      return Boolean(componentProps.defaultChecked);
    })(),
    name: 'Checkbox',
    state: 'checked',
  });

  const indeterminate = () => componentProps.indeterminate ?? false;

  const computedChecked = () => (isGroupedWithParent() ? Boolean(groupChecked()) : checked());
  const computedIndeterminate = () =>
    isGroupedWithParent() ? groupIndeterminate() || indeterminate() : indeterminate();

  registerFieldControl(
    checkboxRef,
    id,
    checked,
    undefined,
    () => !groupContext && !disabled(),
    name,
  );

  onMount(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = computedIndeterminate();
      if (checked()) {
        setFilled(true);
      }
    }
  });

  createEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = computedIndeterminate();
    }
  });

  createEffect(
    on(
      checked,
      () => {
        if (groupContext) {
          return;
        }

        clearErrors(name());
        setFilled(checked());
        setDirty(checked() !== validityData().initialValue);

        validation().change(checked());
      },
      { defer: true },
    ),
  );

  // Registers this checkbox's disabled state with the surrounding parent
  // checkbox hook so it can compute which values count towards "all"/"none".
  createEffect(() => {
    const pc = parentContext;
    const v = value();
    if (!pc || !v) {
      return;
    }

    pc.disabledStatesRef.current.set(v, disabled());

    onCleanup(() => {
      pc.disabledStatesRef.current.delete(v);
    });
  });

  const { getButtonProps, buttonRef } = createButton({
    disabled,
    native: nativeButton,
  });

  const ariaLabelledBy = useAriaLabelledBy(() => componentProps['aria-labelledby'], labelId);

  const rootProps = () => ({
    id: nativeButton() ? inputId() : id(),
    role: 'checkbox',
    'aria-checked': computedIndeterminate() ? 'mixed' : computedChecked(),
    'aria-readonly': readOnly() || undefined,
    'aria-required': required() || undefined,
    'aria-labelledby': ariaLabelledBy(),
    [PARENT_CHECKBOX]: isParent() ? '' : undefined,
    onFocus() {
      if (!disabled()) {
        setFocused(true);
      }
    },
    onBlur() {
      const inputEl = inputRef.current;
      if (!inputEl) {
        return;
      }

      setTouched(true);
      setFocused(false);

      if (validationMode() === 'onBlur') {
        validation().commit(groupContext ? groupValue() : inputEl.checked);
      }
    },
    onKeyDown(event: BaseUIEvent<KeyboardEvent>) {
      if (event.key !== 'Enter') {
        return;
      }

      // Checkboxes must not activate on Enter like buttons do. Stop
      // `createButton`'s own Enter-to-click handling defensively, while still
      // letting a consumer's own `onKeyDown` (which runs before this one)
      // opt out by calling `preventDefault()`.
      event.preventBaseUIHandler();

      if (event.defaultPrevented) {
        return;
      }

      const formToSubmit = inputRef.current?.form ?? null;
      const currentTarget = event.currentTarget as HTMLElement;
      const originalPreventDefault = event.preventDefault.bind(event);
      let preventDefaultCalledAfterPropagation = false;

      // Unlike React, there's no separate synthetic/native event split here:
      // `event` is the native event, so overriding `preventDefault` catches
      // calls from any handler that runs later in this same dispatch
      // (including real DOM ancestors, since `keydown` bubbles), letting them
      // opt out of the auto-submit below.
      event.preventDefault = () => {
        preventDefaultCalledAfterPropagation = true;
        originalPreventDefault();
      };

      // Cancel the native default action (a real <button> would otherwise
      // self-trigger a click on Enter); the checkbox itself must not toggle.
      originalPreventDefault();

      ownerWindow(currentTarget).queueMicrotask(() => {
        event.preventDefault = originalPreventDefault;

        if (!preventDefaultCalledAfterPropagation) {
          // Mirrors native `<input type="checkbox">` behavior: Enter submits
          // the owning form via its default submit button.
          getDefaultFormSubmitter(formToSubmit)?.click();
        }
      });
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

    groupOnChange()?.(nextChecked, eventDetails);

    if (eventDetails.isCanceled) {
      // Unlike React, the DOM input already flipped; resync it with state.
      input.checked = checked();
      return;
    }

    setCheckedState(nextChecked);

    const v = value();
    const gv = groupValue();
    const setGroupValueFn = groupContext?.setValue;
    if (v && gv && setGroupValueFn && !isParent() && !isGroupedWithParent()) {
      const nextGroupValue = nextChecked ? [...gv, v] : gv.filter((item) => item !== v);
      setGroupValueFn(nextGroupValue, eventDetails);
    }
  };

  const state: CheckboxRoot.State = {
    get checked() {
      return computedChecked();
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
    get indeterminate() {
      return computedIndeterminate();
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

  const stateAttributesMapping = checkboxStateAttributesMapping(state);

  return (
    <CheckboxRootContext.Provider value={state}>
      {renderElement('span', componentProps, {
        defaultClass: 'wheel-Checkbox-Root',
        slot: 'checkbox-root',
        state,
        ref: [
          (el: HTMLButtonElement) => {
            checkboxRef.current = el;
          },
          buttonRef,
          groupContext?.registerControlRef,
        ],
        props: [
          rootProps,
          elementProps as Record<string, any>,
          otherGroupProps,
          getButtonProps,
          (props: Record<string, any>) => validation().getValidationProps(disabled(), props),
        ],
        stateAttributesMapping,
      })}
      <Show
        when={
          !checked() &&
          !groupContext &&
          name() &&
          !isParent() &&
          componentProps.uncheckedValue !== undefined
        }
      >
        <input
          type="hidden"
          form={componentProps.form}
          name={name()}
          value={componentProps.uncheckedValue as string}
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
        name={isParent() ? undefined : name()}
        required={required()}
        style={name() ? visuallyHiddenInput : visuallyHidden}
        tabIndex={-1}
        aria-hidden="true"
        value={
          componentProps.value !== undefined
            ? (groupContext ? checked() && componentProps.value : componentProps.value) || ''
            : undefined
        }
        onChange={onInputChange}
        onFocus={() => checkboxRef.current?.focus()}
      />
    </CheckboxRootContext.Provider>
  );
}

export interface CheckboxRootState extends FieldRootState {
  /**
   * Whether the checkbox is currently ticked.
   */
  checked: boolean;
  /**
   * Whether the component should ignore user interaction.
   */
  disabled: boolean;
  /**
   * Whether the user should be unable to tick or untick the checkbox.
   */
  readOnly: boolean;
  /**
   * Whether the user must tick the checkbox before submitting a form.
   */
  required: boolean;
  /**
   * Whether the checkbox is in a mixed state: neither ticked, nor unticked.
   */
  indeterminate: boolean;
}

export interface CheckboxRootProps
  extends NonNativeButtonProps,
    Omit<BaseUIComponentProps<'span', CheckboxRootState>, 'onChange' | 'value'> {
  /**
   * The id of the input element.
   */
  id?: string | undefined;
  /**
   * Identifies the field when a form is submitted.
   * @default undefined
   */
  name?: string | undefined;
  /**
   * Identifies the form that owns the hidden input.
   * Useful when the checkbox is rendered outside the form.
   */
  form?: string | undefined;
  /**
   * Whether the checkbox is currently ticked.
   *
   * To render an uncontrolled checkbox, use the `defaultChecked` prop instead.
   * @default undefined
   */
  checked?: boolean | undefined;
  /**
   * Whether the checkbox is initially ticked.
   *
   * To render a controlled checkbox, use the `checked` prop instead.
   * @default false
   */
  defaultChecked?: boolean | undefined;
  /**
   * Whether the component should ignore user interaction.
   * @default false
   */
  disabled?: boolean | undefined;
  /**
   * Event handler called when the checkbox is ticked or unticked.
   */
  onCheckedChange?:
    | ((checked: boolean, eventDetails: CheckboxRootChangeEventDetails) => void)
    | undefined;
  /**
   * Whether the user should be unable to tick or untick the checkbox.
   * @default false
   */
  readOnly?: boolean | undefined;
  /**
   * Whether the user must tick the checkbox before submitting a form.
   * @default false
   */
  required?: boolean | undefined;
  /**
   * Whether the checkbox is in a mixed state: neither ticked, nor unticked.
   * @default false
   */
  indeterminate?: boolean | undefined;
  /**
   * A ref to access the hidden `<input>` element.
   */
  inputRef?: ((el: HTMLInputElement) => void) | undefined;
  /**
   * Whether the checkbox controls a group of child checkboxes.
   *
   * Must be used in a [Checkbox Group](https://base-ui.com/react/components/checkbox-group).
   * @default false
   */
  parent?: boolean | undefined;
  /**
   * The value submitted with the form when the checkbox is unchecked.
   * By default, unchecked checkboxes do not submit any value, matching native checkbox behavior.
   */
  uncheckedValue?: string | undefined;
  /**
   * The checkbox's value. Identifies it within a [Checkbox Group](https://base-ui.com/react/components/checkbox-group), falling back to `name` when omitted.
   * When submitting a form, a checked box submits `value`; with no `value`, it submits the native "on".
   */
  value?: string | undefined;
}

export type CheckboxRootChangeEventReason = typeof REASONS.none;
export type CheckboxRootChangeEventDetails =
  BaseUIChangeEventDetails<CheckboxRootChangeEventReason>;

export namespace CheckboxRoot {
  export type State = CheckboxRootState;
  export type Props = CheckboxRootProps;
  export type ChangeEventReason = CheckboxRootChangeEventReason;
  export type ChangeEventDetails = CheckboxRootChangeEventDetails;
}
