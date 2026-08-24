/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import type { JSX } from 'solid-js';
import { resolveMultipleLabels, resolveSelectedLabel } from '../../internals/resolveValueLabel';
import { useComboboxRootContext } from '../root/ComboboxRootContext';

/**
 * The current value of the combobox.
 * Doesn't render its own HTML element.
 *
 * Documentation: [Base UI Combobox](https://base-ui.com/react/components/combobox)
 */
export function ComboboxValue(props: ComboboxValue.Props): JSX.Element {
  const store = useComboboxRootContext();

  const itemToStringLabel = store.useState('itemToStringLabel');
  const selectedValue = store.useState('selectedValue');
  const items = store.useState('items');
  const multiple = () => store.useState('selectionMode')() === 'multiple';
  const hasSelectedValue = store.useState('hasSelectedValue');

  // Read exactly once (component bodies run once in Solid; re-reading `props.children` inside a
  // reactive thunk would re-create/re-mount a JSX-element `children` value on every update).
  const childrenValue = props.children;
  const isChildrenFunction = typeof childrenValue === 'function';

  const hasNullItemLabel = store.useState(
    'hasNullItemLabel',
    () => !hasSelectedValue() && props.placeholder != null && childrenValue == null,
  );

  return (
    <>
      {(() => {
        if (isChildrenFunction) {
          return (childrenValue as (value: any) => JSX.Element)(selectedValue());
        }
        if (childrenValue != null) {
          return childrenValue as JSX.Element;
        }
        if (!hasSelectedValue() && props.placeholder != null && !hasNullItemLabel()) {
          return props.placeholder as JSX.Element;
        }
        const currentValue = selectedValue();
        if (multiple() && Array.isArray(currentValue)) {
          return resolveMultipleLabels(currentValue, items(), itemToStringLabel());
        }
        return resolveSelectedLabel(currentValue, items(), itemToStringLabel());
      })()}
    </>
  );
}

export interface ComboboxValueState {}

export interface ComboboxValueProps {
  children?: JSX.Element | ((selectedValue: any) => JSX.Element);
  /**
   * The placeholder value to display when no value is selected.
   * This is overridden by `children` if specified, or by a null item's label in `items`.
   */
  placeholder?: JSX.Element;
}

export namespace ComboboxValue {
  export type State = ComboboxValueState;
  export type Props = ComboboxValueProps;
}
