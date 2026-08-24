/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import type { BaseUIComponentProps } from '../../internals/types';
import { useComboboxDerivedItemsContext, useComboboxRootContext } from '../root/ComboboxRootContext';
import { createInitialLiveRegionTextMutation } from '../utils/createInitialLiveRegionTextMutation';
import { renderElement } from '../../internals/renderElement';

/**
 * Renders its children only when the list is empty.
 * Requires the `items` prop on the root component.
 * Announces changes politely to screen readers.
 * This component's root element must remain mounted in the DOM to announce
 * changes consistently across screen readers. Avoid hiding or removing the
 * component itself with `display: none`, `hidden`, `aria-hidden`, or conditional
 * rendering. Prefer updating or conditionally rendering its children instead.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Combobox](https://base-ui.com/react/components/combobox)
 */
export function ComboboxEmpty(componentProps: ComboboxEmpty.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, ['class', 'style', 'as', 'asChild', 'children']);

  const { filteredItems } = useComboboxDerivedItemsContext();
  const store = useComboboxRootContext();
  const emptyRefSetter = createInitialLiveRegionTextMutation<HTMLDivElement>();

  // Read exactly once (component bodies run once in Solid).
  const childrenValue = local.children;

  return renderElement('div', componentProps, {
    defaultClass: 'wheel-Combobox-Empty',
    slot: 'combobox-empty',
    ref: [
      (el: HTMLElement | null) => {
        store.context.emptyRef.current = el as HTMLDivElement | null;
      },
      emptyRefSetter as unknown as (el: HTMLElement | null) => void,
    ],
    props: [
      {
        role: 'status',
        'aria-live': 'polite',
        'aria-atomic': true,
      },
      elementProps,
    ],
    children: () => (filteredItems().length === 0 ? (childrenValue as JSX.Element) : null),
  });
}

export interface ComboboxEmptyState {}

export interface ComboboxEmptyProps extends BaseUIComponentProps<'div', ComboboxEmptyState> {}

export namespace ComboboxEmpty {
  export type State = ComboboxEmptyState;
  export type Props = ComboboxEmptyProps;
}
