/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createEffect, onCleanup, splitProps, type JSX } from 'solid-js';
import { renderElement } from '../../internals/renderElement';
import { createBaseUiId } from '../../internals/createBaseUiId';
import type { BaseUIComponentProps } from '../../internals/types';
import { useFieldsetRootContext } from '../root/FieldsetRootContext';

/**
 * An accessible label that is automatically associated with the fieldset.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Fieldset](https://base-ui.com/react/components/fieldset)
 */
export function FieldsetLegend(componentProps: FieldsetLegend.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'id',
  ]);

  const { disabled, setLegendId } = useFieldsetRootContext();

  const id = createBaseUiId(() => componentProps.id);

  createEffect(() => {
    setLegendId(id());
    onCleanup(() => {
      setLegendId(undefined);
    });
  });

  const state: FieldsetLegend.State = {
    get disabled() {
      return disabled() ?? false;
    },
  };

  return renderElement('div', componentProps, {
    defaultClass: 'wheel-Fieldset-Legend',
    slot: 'fieldset-legend',
    state,
    props: [() => ({ id: id() }), elementProps as Record<string, any>],
  });
}

export interface FieldsetLegendState {
  /**
   * Whether the component should ignore user interaction.
   */
  disabled: boolean;
}

export interface FieldsetLegendProps extends BaseUIComponentProps<'div', FieldsetLegendState> {}

export namespace FieldsetLegend {
  export type State = FieldsetLegendState;
  export type Props = FieldsetLegendProps;
}
