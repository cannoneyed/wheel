/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-use-signal -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
import { createSignal, splitProps, type JSX } from 'solid-js';
import { renderElement } from '../../internals/renderElement';
import type { BaseUIComponentProps } from '../../internals/types';
import { FieldsetRootContext, useFieldsetRootContext } from './FieldsetRootContext';

/**
 * Groups a shared legend with related controls.
 * Renders a `<fieldset>` element.
 *
 * Documentation: [Base UI Fieldset](https://base-ui.com/react/components/fieldset)
 */
export function FieldsetRoot(componentProps: FieldsetRoot.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'disabled',
  ]);

  const [legendId, setLegendId] = createSignal<string | undefined>(undefined);

  const parentContext = useFieldsetRootContext(true);
  const disabled = () => (parentContext?.disabled() || componentProps.disabled) ?? false;

  const state: FieldsetRoot.State = {
    get disabled() {
      return disabled();
    },
  };

  const contextValue: FieldsetRootContext = {
    legendId,
    setLegendId,
    disabled,
  };

  return (
    <FieldsetRootContext.Provider value={contextValue}>
      {renderElement('fieldset', componentProps, {
        defaultClass: 'wheel-Fieldset-Root',
        slot: 'fieldset-root',
        state,
        props: [
          () => ({
            'aria-labelledby': legendId(),
            disabled: disabled(),
          }),
          elementProps as Record<string, any>,
        ],
      })}
    </FieldsetRootContext.Provider>
  );
}

export interface FieldsetRootState {
  /**
   * Whether the component should ignore user interaction.
   */
  disabled: boolean;
}

export interface FieldsetRootProps extends BaseUIComponentProps<'fieldset', FieldsetRootState> {}

export namespace FieldsetRoot {
  export type State = FieldsetRootState;
  export type Props = FieldsetRootProps;
}
