/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createEffect, onCleanup, splitProps, type JSX } from 'solid-js';
import { renderElement } from '../../internals/renderElement';
import type { BaseUIComponentProps } from '../../internals/types';
import {
  useFieldRootContext,
  type FieldRootState,
} from '../../internals/field-root-context/FieldRootContext';
import { useLabelableContext } from '../../internals/labelable-provider/LabelableContext';
import { fieldValidityMapping } from '../../internals/field-constants/constants';
import { createBaseUiId } from '../../internals/createBaseUiId';
import { useFieldItemContext } from '../item/FieldItemContext';

/**
 * A paragraph with additional information about the field.
 * Renders a `<p>` element.
 *
 * Documentation: [Base UI Field](https://base-ui.com/react/components/field)
 */
export function FieldDescription(componentProps: FieldDescription.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'id',
  ]);

  const id = createBaseUiId(() => componentProps.id);

  const fieldRootContext = useFieldRootContext(false);
  const fieldItemContext = useFieldItemContext();
  const { setMessageIds } = useLabelableContext();

  const state: FieldDescription.State = {
    get disabled() {
      return (fieldRootContext.disabled() || fieldItemContext.disabled()) ?? false;
    },
    get touched() {
      return fieldRootContext.state.touched;
    },
    get dirty() {
      return fieldRootContext.state.dirty;
    },
    get valid() {
      return fieldRootContext.state.valid;
    },
    get filled() {
      return fieldRootContext.state.filled;
    },
    get focused() {
      return fieldRootContext.state.focused;
    },
  };

  createEffect(() => {
    const currentId = id();
    if (!currentId) {
      return;
    }

    setMessageIds((v) => v.concat(currentId));

    onCleanup(() => {
      setMessageIds((v) => v.filter((item) => item !== currentId));
    });
  });

  return renderElement('p', componentProps, {
    defaultClass: 'wheel-Field-Description',
    slot: 'field-description',
    state,
    props: [() => ({ id: id() }), elementProps as Record<string, any>],
    stateAttributesMapping: fieldValidityMapping,
  });
}

export interface FieldDescriptionState extends FieldRootState {}

export interface FieldDescriptionProps extends BaseUIComponentProps<'p', FieldDescriptionState> {}

export namespace FieldDescription {
  export type State = FieldDescriptionState;
  export type Props = FieldDescriptionProps;
}
