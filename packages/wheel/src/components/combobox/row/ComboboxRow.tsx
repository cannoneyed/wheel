/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import type { BaseUIComponentProps } from '../../internals/types';
import { renderElement } from '../../internals/renderElement';
import { ComboboxRowContext } from './ComboboxRowContext';

/**
 * Displays a single row of items in a grid list.
 * Enable `grid` on the root component to turn the listbox into a grid.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Combobox](https://base-ui.com/react/components/combobox)
 */
export function ComboboxRow(componentProps: ComboboxRow.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, ['class', 'style', 'as', 'asChild', 'children']);

  // Inlined `renderElement(...)` call: it must be created *inside* the Provider's JSX so
  // `componentProps.children` (which may include `<Combobox.Item>`, gated on `ComboboxRowContext`
  // for its `gridcell` role) is created after the context exists — see CONVENTIONS.md's "Context
  // is resolved at CREATION time in Solid".
  return (
    <ComboboxRowContext.Provider value={true}>
      {renderElement('div', componentProps, {
        defaultClass: 'wheel-Combobox-Row',
        slot: 'combobox-row',
        props: [{ role: 'row' }, elementProps],
      })}
    </ComboboxRowContext.Provider>
  );
}

export interface ComboboxRowState {}

export interface ComboboxRowProps extends BaseUIComponentProps<'div', ComboboxRowState> {}

export namespace ComboboxRow {
  export type State = ComboboxRowState;
  export type Props = ComboboxRowProps;
}
