/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import { renderElement } from '../../internals/renderElement';
import type { BaseUIComponentProps } from '../../internals/types';
import {
  useFieldRootContext,
  type FieldRootState,
} from '../../internals/field-root-context/FieldRootContext';
import { fieldValidityMapping } from '../../internals/field-constants/constants';
import { FieldItemContext } from './FieldItemContext';
import { LabelableProvider } from '../../internals/labelable-provider';
import { useCheckboxGroupContext } from '../../checkbox-group/CheckboxGroupContext';

/**
 * Groups individual items in a checkbox group or radio group with a label and description.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Field](https://base-ui.com/react/components/field)
 */
export function FieldItem(componentProps: FieldItem.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'disabled',
  ]);

  const { state: fieldState, disabled: rootDisabled } = useFieldRootContext();

  const disabled = () => (rootDisabled() || componentProps.disabled) ?? false;

  const state: FieldItem.State = {
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

  const checkboxGroupContext = useCheckboxGroupContext();
  const hasParentCheckbox = () => checkboxGroupContext?.allValues() !== undefined;
  const controlId = () => (hasParentCheckbox() ? checkboxGroupContext?.parent.id() : undefined);

  const fieldItemContext: FieldItemContext = { disabled };

  return (
    <LabelableProvider controlId={controlId()}>
      <FieldItemContext.Provider value={fieldItemContext}>
        {renderElement('div', componentProps, {
          defaultClass: 'wheel-Field-Item',
          slot: 'field-item',
          state,
          props: elementProps as Record<string, any>,
          stateAttributesMapping: fieldValidityMapping,
        })}
      </FieldItemContext.Provider>
    </LabelableProvider>
  );
}

export interface FieldItemState extends FieldRootState {}

export interface FieldItemProps extends BaseUIComponentProps<'div', FieldItemState> {
  /**
   * Whether the wrapped control should ignore user interaction.
   * The `disabled` prop on `<Field.Root>` takes precedence over this.
   * @default false
   */
  disabled?: boolean | undefined;
}

export namespace FieldItem {
  export type State = FieldItemState;
  export type Props = FieldItemProps;
}
