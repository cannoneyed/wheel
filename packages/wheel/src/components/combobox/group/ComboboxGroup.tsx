/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-use-signal, wheel/require-tracked-show -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
import { createSignal, Show, splitProps, type JSX } from 'solid-js';
import type { BaseUIComponentProps } from '../../internals/types';
import { renderElement } from '../../internals/renderElement';
import { ComboboxGroupContext } from './ComboboxGroupContext';
import { GroupCollectionProvider } from '../collection/GroupCollectionContext';

/**
 * Groups related items with the corresponding label.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Combobox](https://base-ui.com/react/components/combobox)
 */
export function ComboboxGroup(componentProps: ComboboxGroup.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'items',
  ]);

  const [labelId, setLabelId] = createSignal<string | undefined>(undefined);

  const items = () => local.items ?? [];
  const hasItems = () => local.items !== undefined;

  const contextValue: ComboboxGroupContext = {
    labelId,
    setLabelId,
    items,
  };

  // Inlined `renderElement(...)` call inside the Provider's JSX (both here and duplicated in the
  // `<Show>` `when` branch below): `componentProps.children` (which may include
  // `<Combobox.GroupLabel>`) must be created *after* the context exists — see CONVENTIONS.md's
  // "Context is resolved at CREATION time in Solid".
  return (
    <Show
      when={hasItems()}
      fallback={
        <ComboboxGroupContext.Provider value={contextValue}>
          {renderElement('div', componentProps, {
            defaultClass: 'wheel-Combobox-Group',
            slot: 'combobox-group',
            props: [() => ({ role: 'group', 'aria-labelledby': labelId() }), elementProps],
          })}
        </ComboboxGroupContext.Provider>
      }
    >
      <GroupCollectionProvider items={items}>
        <ComboboxGroupContext.Provider value={contextValue}>
          {renderElement('div', componentProps, {
            defaultClass: 'wheel-Combobox-Group',
            slot: 'combobox-group',
            props: [() => ({ role: 'group', 'aria-labelledby': labelId() }), elementProps],
          })}
        </ComboboxGroupContext.Provider>
      </GroupCollectionProvider>
    </Show>
  );
}

export interface ComboboxGroupState {}

export interface ComboboxGroupProps extends BaseUIComponentProps<'div', ComboboxGroupState> {
  /**
   * Items to be rendered within this group.
   * When provided, child `Collection` components will use these items.
   */
  items?: readonly any[] | undefined;
}

export namespace ComboboxGroup {
  export type State = ComboboxGroupState;
  export type Props = ComboboxGroupProps;
}
