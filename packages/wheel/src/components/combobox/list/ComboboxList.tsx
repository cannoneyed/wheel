/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-tracked-show -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
import { createMemo, Show, splitProps, type JSX } from 'solid-js';
import type { BaseUIComponentProps } from '../../internals/types';
import {
  useComboboxDerivedItemsContext,
  useComboboxFloatingContext,
  useComboboxRootContext,
} from '../root/ComboboxRootContext';
import { useComboboxPositionerContext } from '../positioner/ComboboxPositionerContext';
import { ComboboxCollection } from '../collection/ComboboxCollection';
import { CompositeList } from '../../internals/composite/list/CompositeList';
import { stopEvent } from '../../floating-ui-solid';
import { renderElement, type RenderElementComponentProps } from '../../internals/renderElement';

/**
 * A list container for the items.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Combobox](https://base-ui.com/react/components/combobox)
 */
export function ComboboxList(componentProps: ComboboxList.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
  ]);

  const store = useComboboxRootContext();
  const floatingRootContext = useComboboxFloatingContext();
  const hasPositionerContext = Boolean(useComboboxPositionerContext(true));
  const { filteredItems, hasItems } = useComboboxDerivedItemsContext();

  const selectionMode = store.useState('selectionMode');
  const grid = store.useState('grid');
  const popupProps = store.useState('popupProps');
  const virtualized = store.useState('virtualized');
  const forceMounted = store.useState('forceMounted');

  const multiple = () => selectionMode() === 'multiple';
  const empty = () => filteredItems().length === 0;

  // Support the "closed template" API: if children is a function, implicitly wrap it with a
  // Combobox.Collection that reads items from context/root.
  const childrenValue = local.children;
  const resolvedChildren =
    typeof childrenValue === 'function'
      ? () => <ComboboxCollection>{childrenValue as (item: any, index: number) => JSX.Element}</ComboboxCollection>
      : () => childrenValue as JSX.Element;

  const state: ComboboxList.State = {
    get empty() {
      return empty();
    },
  };

  const floatingId = floatingRootContext.useState('floatingId');

  // `ComboboxList.Props.children` accepts a `(item, index) => JSX.Element` render-function shape
  // that doesn't match `renderElement`'s generic `AsChildRenderFn` signature; the "closed
  // template" branch above already normalizes it into a plain `ComboboxCollection` element before
  // reaching here (via `children: resolvedChildren`), so this cast is safe.
  const rendererProps = componentProps as unknown as RenderElementComponentProps<ComboboxListState>;

  const renderList = () =>
    renderElement('div', rendererProps, {
      defaultClass: 'wheel-Combobox-List',
      slot: 'combobox-list',
      state,
      ref: [
        (el: HTMLElement | null) => store.set('listElement', el),
        hasPositionerContext
          ? undefined
          : (el: HTMLElement | null) => store.set('positionerElement', el),
      ],
      props: [
        popupProps,
        () => ({
          tabIndex: -1,
          id: floatingId(),
          role: grid() ? 'grid' : 'listbox',
          'aria-multiselectable': multiple() ? 'true' : undefined,
          onKeyDown(event: KeyboardEvent) {
            if (store.state.disabled || store.state.readOnly) {
              return;
            }

            if (event.key === 'Enter') {
              const activeIndex = store.state.activeIndex;

              if (activeIndex == null) {
                return;
              }

              stopEvent(event);

              const listItem = store.context.listRef.current[activeIndex];

              if (listItem) {
                store.context.selectionEventRef.current = event;
                listItem.click();
                store.context.selectionEventRef.current = null;
              }
            }
          },
          'oncapture:keydown': () => {
            store.context.keyboardActiveRef.current = true;
          },
          'oncapture:pointermove': () => {
            store.context.keyboardActiveRef.current = false;
          },
        }),
        elementProps,
      ],
      children: resolvedChildren,
    });

  // With the `items` prop, typeahead labels are derived from the items so they survive the list
  // unmounting (unmounting clears the registered labels). Rendered labels only need to be
  // registered when the list is force-mounted to match browser autofill against rendered text.
  const labelsRef = createMemo(() =>
    hasItems() && !forceMounted() ? undefined : store.context.labelsRef.current,
  );

  // Inlined `renderElement(...)` call (via `renderList()`, invoked separately in each branch):
  // descendant `<Combobox.Item>`s register themselves through `CompositeListContext`, so the list
  // must be created *inside* `<CompositeList>`'s JSX — see CONVENTIONS.md's "Context is resolved
  // at CREATION time in Solid". The virtualized branch skips `CompositeList` entirely (matching
  // upstream): externally virtualized items report their own index instead of registering.
  return (
    <Show when={!virtualized()} fallback={renderList()}>
      <CompositeList elements={store.context.listRef.current} labels={labelsRef()}>
        {renderList()}
      </CompositeList>
    </Show>
  );
}

export interface ComboboxListState {
  /**
   * Whether the list is empty.
   */
  empty: boolean;
}

export interface ComboboxListProps
  extends Omit<BaseUIComponentProps<'div', ComboboxListState>, 'children'> {
  children?: JSX.Element | ((item: any, index: number) => JSX.Element);
}

export namespace ComboboxList {
  export type State = ComboboxListState;
  export type Props = ComboboxListProps;
}
