/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { useSignal } from '../../../core/local-state';
import { createEffect, splitProps, type JSX } from 'solid-js';
import type { BaseUIComponentProps } from '../../internals/types';
import { ComboboxChipsContext } from './ComboboxChipsContext';
import { CompositeList } from '../../internals/composite/list/CompositeList';
import { useComboboxRootContext } from '../root/ComboboxRootContext';
import { handleInputPress } from '../utils/handleInputPress';
import { renderElement } from '../../internals/renderElement';

/**
 * A container for the chips in a multiselectable input.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Combobox](https://base-ui.com/react/components/combobox)
 */
export function ComboboxChips(componentProps: ComboboxChips.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, ['class', 'style', 'as', 'asChild', 'children']);

  const store = useComboboxRootContext();

  const open = store.useState('open');
  const hasSelectionChips = store.useState('hasSelectionChips');

  const [highlightedChipIndex, setHighlightedChipIndexSignal] = useSignal<number | undefined>(
    undefined, 'highlightedChipIndex');
  const setHighlightedChipIndex = (index: number | undefined) => setHighlightedChipIndexSignal(index);

  createEffect(() => {
    if (open() && highlightedChipIndex() !== undefined) {
      setHighlightedChipIndex(undefined);
    }
  });

  const chipsRef: { current: Array<HTMLButtonElement | null> } = { current: [] };

  const contextValue: ComboboxChipsContext = {
    highlightedChipIndex,
    setHighlightedChipIndex,
    chipsRef,
  };

  // Inlined `renderElement(...)` call inside both the `CompositeList` and `ComboboxChipsContext`
  // providers: `componentProps.children` (the `<Combobox.Chip>`s) must be created *after* both
  // contexts exist — see CONVENTIONS.md's "Context is resolved at CREATION time in Solid".
  return (
    <ComboboxChipsContext.Provider value={contextValue}>
      <CompositeList elements={chipsRef.current}>
        {renderElement('div', componentProps, {
          defaultClass: 'wheel-Combobox-Chips',
          slot: 'combobox-chips',
          ref: (el: HTMLElement | null) => {
            store.context.chipsContainerRef.current = el as HTMLDivElement | null;
          },
          // NVDA enters browse mode instead of staying in focus mode when navigating with
          // arrow keys inside a container unless it has a toolbar role.
          props: [
            () => (hasSelectionChips() ? { role: 'toolbar' } : {}),
            {
              onMouseDown(event: MouseEvent) {
                handleInputPress(event, store, store.state.disabled, store.state.readOnly);
              },
            },
            elementProps,
          ],
        })}
      </CompositeList>
    </ComboboxChipsContext.Provider>
  );
}

export interface ComboboxChipsState {}

export interface ComboboxChipsProps extends BaseUIComponentProps<'div', ComboboxChipsState> {}

export namespace ComboboxChips {
  export type State = ComboboxChipsState;
  export type Props = ComboboxChipsProps;
}
