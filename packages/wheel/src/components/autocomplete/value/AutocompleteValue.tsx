/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import type { JSX } from 'solid-js';
import { useComboboxRootContext } from '../../combobox/root/ComboboxRootContext';

/**
 * The current value of the autocomplete.
 * Doesn't render its own HTML element.
 *
 * Documentation: [Base UI Autocomplete](https://base-ui.com/react/components/autocomplete)
 *
 * Solid port of upstream's `autocomplete/value/AutocompleteValue.tsx`. Upstream reads the current
 * input value from a dedicated `ComboboxInputValueContext` (a React-specific workaround — see
 * `ComboboxRoot.tsx`'s `inputValue` field doc comment); the Solid combobox store already keeps
 * `inputValue` directly in its fine-grained reactive state, so this reads `store.useState`
 * directly instead.
 */
export function AutocompleteValue(props: AutocompleteValue.Props): JSX.Element {
  const store = useComboboxRootContext();
  const inputValue = store.useState('inputValue');

  // Read exactly once (component bodies run once in Solid; re-reading `props.children` inside a
  // reactive thunk would re-create/re-mount a JSX-element `children` value on every update).
  const childrenValue = props.children;
  const isChildrenFunction = typeof childrenValue === 'function';

  return (
    <>
      {(() => {
        if (isChildrenFunction) {
          return (childrenValue as (value: string) => JSX.Element)(String(inputValue()));
        }
        if (childrenValue != null) {
          return childrenValue as JSX.Element;
        }
        return inputValue();
      })()}
    </>
  );
}

export interface AutocompleteValueState {}

export interface AutocompleteValueProps {
  children?: JSX.Element | ((value: string) => JSX.Element);
}

export namespace AutocompleteValue {
  export type State = AutocompleteValueState;
  export type Props = AutocompleteValueProps;
}
