/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { useSignal } from '../../core/local-state';
import { createEffect, splitProps, type JSX } from 'solid-js';
import { createValueChanged } from '../base-utils/createValueChanged';
import { EMPTY_OBJECT } from '../base-utils/empty';
import { renderElement } from '../internals/renderElement';
import type { BaseUIComponentProps } from '../internals/types';
import { FormContext, type Errors } from '../internals/form-context/FormContext';
import type { ValidationMode } from '../internals/field-root-context/FieldRootContext';
import {
  createGenericEventDetails,
  type BaseUIGenericEventDetails,
} from '../internals/createBaseUIEventDetails';
import { REASONS } from '../internals/reasons';

/**
 * A native form element with consolidated error handling.
 * Renders a `<form>` element.
 *
 * Documentation: [Base UI Form](https://base-ui.com/react/components/form)
 */
export function Form<FormValues extends Record<string, any> = Record<string, any>>(
  componentProps: Form.Props<FormValues>,
): JSX.Element {
  const [, elementProps] = splitProps(componentProps as Form.Props, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'validationMode',
    'errors',
    'onSubmit',
    'onFormSubmit',
    'actionsRef',
  ]);

  const formRef: FormContext['formRef'] = {
    current: { fields: new Map() },
  };
  let submitted = false;
  const submitAttempted: { current: boolean } = { current: false };

  const focusControl = (control: HTMLElement | null) => {
    if (!control) {
      return;
    }
    control.focus();
    if (control.tagName === 'INPUT') {
      (control as HTMLInputElement).select();
    }
  };

  const [errors, setErrors] = useSignal<Errors>(
    componentProps.errors ?? (EMPTY_OBJECT as Errors), 'errors');

  createValueChanged(
    () => componentProps.errors,
    () => {
      setErrors(componentProps.errors ?? (EMPTY_OBJECT as Errors));
    },
  );

  createEffect(() => {
    // Track `errors` so this reruns after submit-triggered error updates (e.g. server-provided
    // errors set asynchronously after `onFormSubmit`), matching upstream's `[errors, focusControl]`
    // effect dependency.
    errors();

    if (!submitted) {
      return;
    }
    submitted = false;

    // Defer past the current reactive flush: sibling field effects fold a
    // newly-set `errors` prop into each field's registry entry, and Solid
    // (unlike React, where a parent's passive effect runs after all child
    // effects) guarantees no ordering between this effect and theirs.
    queueMicrotask(() => {
      const invalidFields = Array.from(formRef.current.fields.values()).filter(
        (field) => field.validityData.state.valid === false,
      );

      if (invalidFields.length) {
        focusControl(invalidFields[0].controlRef.current);
      }
    });
  });

  const handleImperativeValidate = (fieldName?: string) => {
    const values = Array.from(formRef.current.fields.values());

    if (fieldName) {
      const namedField = values.find((field) => field.name === fieldName);
      namedField?.validate();
    } else {
      values.forEach((field) => {
        field.validate();
      });
    }
  };

  createEffect(() => {
    if (componentProps.actionsRef) {
      componentProps.actionsRef.current = { validate: handleImperativeValidate };
    }
  });

  const clearErrors = (name: string | undefined) => {
    if (name && Object.hasOwn(errors(), name)) {
      const nextErrors = { ...errors() };
      delete nextErrors[name];
      setErrors(nextErrors);
    }
  };

  const validationMode = () => componentProps.validationMode ?? 'onSubmit';

  const contextValue: FormContext = {
    formRef,
    validationMode,
    errors,
    clearErrors,
    submitAttempted,
  };

  return (
    <FormContext.Provider value={contextValue}>
      {renderElement('form', componentProps, {
        defaultClass: 'wheel-Form',
        slot: 'form',
        props: [
          {
            noValidate: true,
            onSubmit(event: SubmitEvent) {
              submitAttempted.current = true;

              let values = Array.from(formRef.current.fields.values());

              // Async validation isn't supported to stop the submit event.
              values.forEach((field) => {
                field.validate();
              });

              values = Array.from(formRef.current.fields.values());

              const invalidField = values.find(
                (field) => field.validityData.state.valid === false,
              );

              if (invalidField) {
                event.preventDefault();
                focusControl(invalidField.controlRef.current);
              } else {
                submitted = true;
                (componentProps.onSubmit as ((event: SubmitEvent) => void) | undefined)?.(event);

                if (componentProps.onFormSubmit) {
                  event.preventDefault();

                  const formValues = values.reduce((acc, field) => {
                    if (field.name) {
                      (acc as Record<string, any>)[field.name] = field.getValue();
                    }
                    return acc;
                  }, {} as FormValues);

                  componentProps.onFormSubmit(
                    formValues,
                    createGenericEventDetails(REASONS.none, event),
                  );
                }
              }
            },
          },
          elementProps as Record<string, any>,
        ],
      })}
    </FormContext.Provider>
  );
}

export type FormSubmitEventReason = typeof REASONS.none;
export type FormSubmitEventDetails = BaseUIGenericEventDetails<FormSubmitEventReason>;

export type FormValidationMode = ValidationMode;

export interface FormActions {
  validate: (fieldName?: string | undefined) => void;
}

export interface FormState {}

export interface FormProps<FormValues extends Record<string, any> = Record<string, any>>
  extends BaseUIComponentProps<'form', FormState> {
  /**
   * Determines when the form should be validated.
   * The `validationMode` prop on `<Field.Root>` takes precedence over this.
   *
   * - `onSubmit` (default): validates the field when the form is submitted, afterwards fields will re-validate on change.
   * - `onBlur`: validates a field when it loses focus.
   * - `onChange`: validates the field on every change to its value.
   *
   * @default 'onSubmit'
   */
  validationMode?: FormValidationMode | undefined;
  /**
   * Validation errors returned externally, typically after submission by a server or a form action.
   * This should be an object where keys correspond to the `name` attribute on `<Field.Root>`,
   * and values correspond to error(s) related to that field.
   */
  errors?: Errors | undefined;
  /**
   * Event handler called when the form is submitted.
   * `preventDefault()` is called on the native submit event when used.
   */
  onFormSubmit?:
    | ((formValues: FormValues, eventDetails: FormSubmitEventDetails) => void)
    | undefined;
  /**
   * A ref to imperative actions.
   * - `validate`: Validates all fields when called. Optionally pass a field name to validate a single field.
   */
  actionsRef?: { current: FormActions | null } | undefined;
}

export namespace Form {
  export type Props<FormValues extends Record<string, any> = Record<string, any>> =
    FormProps<FormValues>;
  export type State = FormState;
  export type Actions = FormActions;
  export type ValidationMode = FormValidationMode;
  export type SubmitEventReason = FormSubmitEventReason;
  export type SubmitEventDetails = FormSubmitEventDetails;

  export type Values<FormValues extends Record<string, any> = Record<string, any>> = FormValues;
}
