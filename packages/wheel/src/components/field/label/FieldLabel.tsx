/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import { renderElement } from '../../internals/renderElement';
import type { BaseUIComponentProps } from '../../internals/types';
import {
  useFieldRootContext,
  type FieldRootState,
} from '../../internals/field-root-context/FieldRootContext';
import { fieldValidityMapping } from '../../internals/field-constants/constants';
import { useLabelableContext } from '../../internals/labelable-provider/LabelableContext';
import { useLabel } from '../../internals/labelable-provider/useLabel';
import { useFieldItemContext } from '../item/FieldItemContext';

/**
 * An accessible label that is automatically associated with the field control.
 * Renders a `<label>` element.
 *
 * Documentation: [Base UI Field](https://base-ui.com/react/components/field)
 *
 * Deviation: upstream also runs a dev-only effect that warns when `nativeLabel` and the actually
 * rendered tag disagree (using `SafeReact.captureOwnerStack`). `safeReact`/React-owner-stack shims
 * are explicitly out of scope for this port (see CONVENTIONS.md), so that diagnostic is omitted.
 */
export function FieldLabel(componentProps: FieldLabel.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'id',
    'nativeLabel',
  ]);

  const nativeLabel = () => componentProps.nativeLabel ?? true;

  const fieldRootContext = useFieldRootContext(false);
  const fieldItemContext = useFieldItemContext();
  const { labelId } = useLabelableContext();

  const state: FieldLabel.State = {
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

  const labelProps = useLabel({
    id: () => labelId() ?? componentProps.id,
    native: nativeLabel,
  });

  return renderElement('label', componentProps, {
    defaultClass: 'wheel-Field-Label',
    slot: 'field-label',
    state,
    props: [labelProps, elementProps as Record<string, any>],
    stateAttributesMapping: fieldValidityMapping,
  });
}

export interface FieldLabelState extends FieldRootState {}

export interface FieldLabelProps extends BaseUIComponentProps<'label', FieldLabelState> {
  /**
   * Whether the component renders a native `<label>` element when replacing it via `as`/`asChild`.
   * Set to `false` if the rendered element is not a label (for example, `<div>`).
   *
   * This is useful to avoid inheriting label behaviors on `<button>` controls, including avoiding
   * `:hover` on the button when hovering the label, and preventing clicks on the label from firing
   * on the button.
   * @default true
   */
  nativeLabel?: boolean | undefined;
}

export namespace FieldLabel {
  export type State = FieldLabelState;
  export type Props = FieldLabelProps;
}
