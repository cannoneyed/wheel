/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import type { BaseUIComponentProps } from '../../internals/types';
import { renderElement } from '../../internals/renderElement';
import { useFieldRootContext } from '../../internals/field-root-context/FieldRootContext';
import { fieldValidityMapping } from '../../internals/field-constants/constants';
import { useLabel } from '../../internals/labelable-provider/useLabel';
import { getDefaultLabelId } from '../../utils/resolveAriaLabelledBy';
import { useSelectRootContext } from '../root/SelectRootContext';
import type { FieldRoot } from '../../field/root/FieldRoot';

/**
 * An accessible label that is automatically associated with the select trigger.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Select](https://base-ui.com/react/components/select)
 */
export function SelectLabel(componentProps: SelectLabel.Props): JSX.Element {
  // Keep label id derived from the root; ignore runtime `id` overrides. The public `Props` type
  // omits `id`, so it isn't a valid splitProps key — go through an untyped view of the props to
  // strip a stray `id` a consumer might still pass via untyped usage.
  const [, elementProps] = splitProps(componentProps as Record<string, unknown>, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'id',
  ]);

  const fieldRootContext = useFieldRootContext();
  const { store } = useSelectRootContext();

  const triggerElement = store.useState('triggerElement');
  const rootId = store.useState('id');
  const defaultLabelId = () => getDefaultLabelId(rootId());

  const labelProps = useLabel({
    id: defaultLabelId,
    fallbackControlId: () => triggerElement()?.id ?? rootId(),
    setLabelId(nextLabelId) {
      store.set('labelId', nextLabelId);
    },
  });

  return renderElement('div', componentProps, {
    defaultClass: 'wheel-Select-Label',
    slot: 'select-label',
    state: fieldRootContext.state,
    props: [labelProps, elementProps],
    stateAttributesMapping: fieldValidityMapping,
  });
}

export type SelectLabelState = FieldRoot.State;

export interface SelectLabelProps
  extends Omit<BaseUIComponentProps<'div', SelectLabelState>, 'id'> {}

export namespace SelectLabel {
  export type State = SelectLabelState;
  export type Props = SelectLabelProps;
}
