/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import type { BaseUIComponentProps } from '../../internals/types';
import { createInitialLiveRegionTextMutation } from '../utils/createInitialLiveRegionTextMutation';
import { renderElement } from '../../internals/renderElement';

/**
 * Displays a status message whose content changes are announced politely to screen readers.
 * Useful for conveying the status of an asynchronously loaded list.
 * This component's root element must remain mounted in the DOM to announce
 * changes consistently across screen readers. Avoid hiding or removing the
 * component itself with `display: none`, `hidden`, `aria-hidden`, or conditional
 * rendering. Prefer updating or conditionally rendering its children instead.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Combobox](https://base-ui.com/react/components/combobox)
 */
export function ComboboxStatus(componentProps: ComboboxStatus.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, ['class', 'style', 'as', 'asChild', 'children']);

  const statusRefSetter = createInitialLiveRegionTextMutation<HTMLDivElement>();

  // Read exactly once (component bodies run once in Solid).
  const childrenValue = local.children;

  return renderElement('div', componentProps, {
    defaultClass: 'wheel-Combobox-Status',
    slot: 'combobox-status',
    ref: statusRefSetter,
    props: [
      {
        role: 'status',
        'aria-live': 'polite',
        'aria-atomic': true,
      },
      elementProps,
    ],
    children: () => childrenValue as JSX.Element,
  });
}

export interface ComboboxStatusState {}

export interface ComboboxStatusProps extends BaseUIComponentProps<'div', ComboboxStatusState> {}

export namespace ComboboxStatus {
  export type State = ComboboxStatusState;
  export type Props = ComboboxStatusProps;
}
