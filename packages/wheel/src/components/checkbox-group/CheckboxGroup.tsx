/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createEffect, on, splitProps, untrack } from 'solid-js';
import { createControllableSignal } from '../base-utils/createControllableSignal';
import { EMPTY_ARRAY } from '../base-utils/empty';
import { renderElement } from '../internals/renderElement';
import { createBaseUiId } from '../internals/createBaseUiId';
import type { BaseUIComponentProps } from '../internals/types';
import { areArraysEqual } from '../internals/areArraysEqual';
import {
  useFieldRootContext,
  type FieldRootState,
} from '../internals/field-root-context/FieldRootContext';
import { registerFieldControl } from '../internals/field-register-control/registerFieldControl';
import { useFormContext } from '../internals/form-context/FormContext';
import { useLabelableContext } from '../internals/labelable-provider/LabelableContext';
import {
  CheckboxGroupContext,
  type CheckboxGroupContext as CheckboxGroupContextType,
} from './CheckboxGroupContext';
import { useCheckboxGroupParent } from './useCheckboxGroupParent';
import { stateAttributesMapping } from './stateAttributesMapping';
import { PARENT_CHECKBOX } from '../checkbox/root/CheckboxRoot';
import type { BaseUIChangeEventDetails } from '../internals/createBaseUIEventDetails';
import { REASONS } from '../internals/reasons';

const EMPTY = EMPTY_ARRAY as readonly string[];

/**
 * Provides a shared state to a series of checkboxes.
 *
 * Documentation: [Base UI Checkbox Group](https://base-ui.com/react/components/checkbox-group)
 */
export function CheckboxGroup(componentProps: CheckboxGroup.Props) {
  const [, elementProps] = splitProps(componentProps, [
    'allValues',
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'defaultValue',
    'disabled',
    'id',
    'onValueChange',
    'value',
  ]);

  const fieldContext = useFieldRootContext();
  const { clearErrors } = useFormContext();
  const { labelId } = useLabelableContext();

  const disabled = () => (fieldContext.disabled() || componentProps.disabled) ?? false;

  // Captured once at setup, mirroring upstream: a controlled group has no
  // meaningful `defaultValue` (there's nothing to derive grouped checkboxes'
  // `defaultChecked` from), an uncontrolled one defaults to `[]`.
  const defaultValue: readonly string[] | undefined = untrack(() =>
    componentProps.value === undefined ? (componentProps.defaultValue ?? EMPTY) : undefined,
  );

  const [groupValue, setValueUnwrapped] = createControllableSignal<string[]>({
    controlled: () => componentProps.value,
    default: (defaultValue ?? EMPTY) as string[],
    name: 'CheckboxGroup',
    state: 'value',
  });

  const setValue = (v: string[], eventDetails: CheckboxGroup.ChangeEventDetails) => {
    componentProps.onValueChange?.(v, eventDetails);

    if (eventDetails.isCanceled) {
      return;
    }

    setValueUnwrapped(v);
  };

  const allValues = () => componentProps.allValues;

  const parent = useCheckboxGroupParent({
    allValues,
    value: groupValue,
    onValueChange: setValue,
  });

  const id = createBaseUiId(() => componentProps.id);

  const controlRef: { current: HTMLElement | null } = { current: null };
  const registerControlRef = (element: HTMLElement | null) => {
    if (controlRef.current == null && element != null && !element.hasAttribute(PARENT_CHECKBOX)) {
      controlRef.current = element;
    }
  };

  registerFieldControl(
    controlRef,
    id,
    groupValue,
    undefined,
    () => !!fieldContext.name() && !disabled(),
    fieldContext.name,
  );

  const resolvedValue = () => groupValue() ?? EMPTY;

  createEffect(
    on(
      resolvedValue,
      () => {
        if (fieldContext.name()) {
          clearErrors(fieldContext.name());
        }

        const initialValue = Array.isArray(fieldContext.validityData().initialValue)
          ? (fieldContext.validityData().initialValue as readonly string[])
          : EMPTY;

        fieldContext.setFilled(resolvedValue().length > 0);
        fieldContext.setDirty(!areArraysEqual(resolvedValue(), initialValue));

        fieldContext.validation.change(resolvedValue());
      },
      { defer: true },
    ),
  );

  const state: CheckboxGroup.State = {
    get disabled() {
      return disabled();
    },
    get touched() {
      return fieldContext.state.touched;
    },
    get dirty() {
      return fieldContext.state.dirty;
    },
    get valid() {
      return fieldContext.state.valid;
    },
    get filled() {
      return fieldContext.state.filled;
    },
    get focused() {
      return fieldContext.state.focused;
    },
  };

  const contextValue: CheckboxGroupContextType = {
    value: groupValue,
    defaultValue,
    setValue,
    allValues,
    parent,
    disabled,
    validation: fieldContext.validation,
    registerControlRef,
  };

  return (
    <CheckboxGroupContext.Provider value={contextValue}>
      {renderElement('div', componentProps, {
        defaultClass: 'wheel-CheckboxGroup',
        slot: 'checkbox-group',
        state,
        props: [
          () => ({
            id: id(),
            role: 'group',
            'aria-labelledby': labelId(),
          }),
          elementProps as Record<string, any>,
        ],
        stateAttributesMapping,
      })}
    </CheckboxGroupContext.Provider>
  );
}

export interface CheckboxGroupState extends FieldRootState {
  /**
   * Whether the component should ignore user interaction.
   */
  disabled: boolean;
}

export interface CheckboxGroupProps extends BaseUIComponentProps<'div', CheckboxGroupState> {
  /**
   * Names of the checkboxes in the group that should be ticked.
   *
   * To render an uncontrolled checkbox group, use the `defaultValue` prop instead.
   */
  value?: string[] | undefined;
  /**
   * Names of the checkboxes in the group that should be initially ticked.
   *
   * To render a controlled checkbox group, use the `value` prop instead.
   */
  defaultValue?: string[] | undefined;
  /**
   * Event handler called when a checkbox in the group is ticked or unticked.
   * Provides the new value as an argument.
   */
  onValueChange?:
    | ((value: string[], eventDetails: CheckboxGroupChangeEventDetails) => void)
    | undefined;
  /**
   * Names of all checkboxes in the group. Use this when creating a parent checkbox.
   */
  allValues?: string[] | undefined;
  /**
   * Whether the component should ignore user interaction.
   * @default false
   */
  disabled?: boolean | undefined;
}

export type CheckboxGroupChangeEventReason = typeof REASONS.none;
export type CheckboxGroupChangeEventDetails =
  BaseUIChangeEventDetails<CheckboxGroupChangeEventReason>;

export namespace CheckboxGroup {
  export type State = CheckboxGroupState;
  export type Props = CheckboxGroupProps;
  export type ChangeEventReason = CheckboxGroupChangeEventReason;
  export type ChangeEventDetails = CheckboxGroupChangeEventDetails;
}
