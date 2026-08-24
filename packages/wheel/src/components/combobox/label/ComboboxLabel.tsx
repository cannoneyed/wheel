/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import type { BaseUIComponentProps } from '../../internals/types';
import { renderElement } from '../../internals/renderElement';
import { useFieldRootContext } from '../../internals/field-root-context/FieldRootContext';
import { fieldValidityMapping } from '../../internals/field-constants/constants';
import { useLabel } from '../../internals/labelable-provider/useLabel';
import { getDefaultLabelId } from '../../utils/resolveAriaLabelledBy';
import { useComboboxRootContext } from '../root/ComboboxRootContext';
import type { FieldRoot } from '../../field/root/FieldRoot';

/**
 * An accessible label that is automatically associated with the combobox trigger.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Combobox](https://base-ui.com/react/components/combobox)
 */
export function ComboboxLabel(componentProps: ComboboxLabel.Props): JSX.Element {
  // Keep label id derived from the root; ignore runtime `id` overrides (mirrors `SelectLabel`).
  const [, elementProps] = splitProps(componentProps as Record<string, unknown>, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'id',
  ]);

  const fieldRootContext = useFieldRootContext();
  const store = useComboboxRootContext();

  const inputInsidePopup = store.useState('inputInsidePopup');
  const triggerElement = store.useState('triggerElement');
  const rootId = store.useState('id');
  const defaultLabelId = () => getDefaultLabelId(rootId());

  const labelProps = useLabel({
    id: defaultLabelId,
    fallbackControlId: () => triggerElement()?.id ?? (inputInsidePopup() ? rootId() : undefined),
    setLabelId(nextLabelId) {
      store.set('labelId', nextLabelId);
    },
  });

  return renderElement('div', componentProps, {
    defaultClass: 'wheel-Combobox-Label',
    slot: 'combobox-label',
    state: fieldRootContext.state,
    props: [labelProps, elementProps],
    stateAttributesMapping: fieldValidityMapping,
  });
}

export interface ComboboxLabelState extends FieldRoot.State {}

export interface ComboboxLabelProps
  extends Omit<BaseUIComponentProps<'div', ComboboxLabelState>, 'id'> {}

export namespace ComboboxLabel {
  export type State = ComboboxLabelState;
  export type Props = ComboboxLabelProps;
}
