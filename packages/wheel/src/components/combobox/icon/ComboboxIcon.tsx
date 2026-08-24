/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import type { BaseUIComponentProps } from '../../internals/types';
import { renderElement } from '../../internals/renderElement';

/**
 * An icon that indicates that the trigger button opens the popup.
 * Renders a `<span>` element.
 *
 * Documentation: [Base UI Combobox](https://base-ui.com/react/components/combobox)
 */
export function ComboboxIcon(componentProps: ComboboxIcon.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, ['class', 'style', 'as', 'asChild', 'children']);

  return renderElement('span', componentProps, {
    defaultClass: 'wheel-Combobox-Icon',
    slot: 'combobox-icon',
    props: [{ 'aria-hidden': true }, elementProps],
    children: () => '▼',
  });
}

export interface ComboboxIconState {}

export interface ComboboxIconProps extends BaseUIComponentProps<'span', ComboboxIconState> {}

export namespace ComboboxIcon {
  export type State = ComboboxIconState;
  export type Props = ComboboxIconProps;
}
