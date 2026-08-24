/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import type { JSX } from 'solid-js';
import { useFieldRootContext } from '../../internals/field-root-context/FieldRootContext';
import { getCombinedFieldValidityData } from '../utils/getCombinedFieldValidityData';
import type { FieldValidityData } from '../root/FieldRoot';
import { createTransitionStatus, type TransitionStatus } from '../../internals/createTransitionStatus';

/**
 * Used to display a custom message based on the field's validity.
 * Requires `children` to be a function that accepts field validity state as an argument.
 *
 * Documentation: [Base UI Field](https://base-ui.com/react/components/field)
 */
export function FieldValidity(props: FieldValidity.Props): JSX.Element {
  const { validityData, invalid } = useFieldRootContext(false);

  const combinedFieldValidityData = () => getCombinedFieldValidityData(validityData(), invalid());
  const isInvalid = () => combinedFieldValidityData().state.valid === false;
  const { transitionStatus } = createTransitionStatus(isInvalid);

  const fieldValidityState = (): FieldValidity.State => {
    const combined = combinedFieldValidityData();
    return {
      ...combined,
      validity: combined.state,
      transitionStatus: transitionStatus(),
    };
  };

  return <>{props.children(fieldValidityState())}</>;
}

export interface FieldValidityState extends Omit<FieldValidityData, 'state'> {
  /**
   * The validity state.
   */
  validity: FieldValidityData['state'];
  /**
   * The transition status of the component.
   */
  transitionStatus: TransitionStatus;
}

export interface FieldValidityProps {
  /**
   * A function that accepts the field validity state as an argument.
   *
   * ```jsx
   * <Field.Validity>
   *   {(validity) => {
   *     return <div>...</div>
   *   }}
   * </Field.Validity>
   * ```
   */
  children: (state: FieldValidityState) => JSX.Element;
}

export namespace FieldValidity {
  export type State = FieldValidityState;
  export type Props = FieldValidityProps;
}
