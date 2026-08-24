/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import type { BaseUIComponentProps } from '../../internals/types';
import { renderElement } from '../../internals/renderElement';
import { useSelectRootContext } from '../root/SelectRootContext';
import { resolveMultipleLabels, resolveSelectedLabel } from '../../internals/resolveValueLabel';
import type { StateAttributesMapping } from '../../internals/getStateAttributesProps';

const stateAttributesMapping: StateAttributesMapping<SelectValueState> = {
  value: () => null,
};

/**
 * A text label of the currently selected item.
 * Renders a `<span>` element.
 *
 * Documentation: [Base UI Select](https://base-ui.com/react/components/select)
 */
export function SelectValue(componentProps: SelectValue.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'placeholder',
  ]);

  const { store, valueRef } = useSelectRootContext();

  const value = store.useState('value');
  const items = store.useState('items');
  const itemToStringLabel = store.useState('itemToStringLabel');
  const hasSelectedValue = store.useState('hasSelectedValue');

  // Read exactly once (component bodies run once in Solid; re-reading `props.children` inside a
  // reactive thunk would re-create/re-mount a JSX-element `children` value on every update).
  const childrenValue = local.children;
  const isChildrenFunction = typeof childrenValue === 'function';

  const hasNullItemLabel = store.useState(
    'hasNullItemLabel',
    () => !hasSelectedValue() && local.placeholder != null && childrenValue == null,
  );

  const state: SelectValue.State = {
    get value() {
      return value();
    },
    get placeholder() {
      return !hasSelectedValue();
    },
  };

  const children = (): JSX.Element => {
    if (isChildrenFunction) {
      return (childrenValue as (value: any) => JSX.Element)(value());
    }
    if (childrenValue != null) {
      return childrenValue as JSX.Element;
    }
    if (!hasSelectedValue() && local.placeholder != null && !hasNullItemLabel()) {
      return local.placeholder as JSX.Element;
    }
    const currentValue = value();
    if (Array.isArray(currentValue)) {
      return resolveMultipleLabels(currentValue, items(), itemToStringLabel());
    }
    return resolveSelectedLabel(currentValue, items(), itemToStringLabel());
  };

  return renderElement('span', componentProps, {
    defaultClass: 'wheel-Select-Value',
    slot: 'select-value',
    state,
    ref: (el: HTMLSpanElement | null) => {
      valueRef.current = el;
    },
    props: elementProps,
    // `renderElement` deliberately strips a `children` key from the merged `props` array (it's
    // reserved for the real JSX children slot), so the computed label/placeholder content must be
    // supplied through this dedicated `children` option instead.
    children,
    stateAttributesMapping,
  });
}

export interface SelectValueState {
  /**
   * The value of the currently selected item.
   */
  value: any;
  /**
   * Whether the placeholder is being displayed.
   */
  placeholder: boolean;
}

export interface SelectValueProps
  extends Omit<BaseUIComponentProps<'span', SelectValueState>, 'children'> {
  /**
   * Accepts a function that returns rendered content to format the selected value.
   */
  children?: JSX.Element | ((value: any) => JSX.Element);
  /**
   * The placeholder value to display when no value is selected.
   * This is overridden by `children` if specified, or by a null item's label in `items`.
   */
  placeholder?: JSX.Element;
}

export namespace SelectValue {
  export type State = SelectValueState;
  export type Props = SelectValueProps;
}
