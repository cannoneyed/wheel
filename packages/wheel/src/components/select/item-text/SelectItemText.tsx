/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import type { BaseUIComponentProps } from '../../internals/types';
import { useSelectRootContext } from '../root/SelectRootContext';
import { useSelectItemContext } from '../item/SelectItemContext';
import { renderElement } from '../../internals/renderElement';

/**
 * A text label of the select item.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Select](https://base-ui.com/react/components/select)
 */
export function SelectItemText(componentProps: SelectItemText.Props): JSX.Element {
  const { index, textRef, selectedByFocus, hasRegistered } = useSelectItemContext();
  const { firstItemTextRef, selectedItemTextRef } = useSelectRootContext();

  const [, elementProps] = splitProps(componentProps, ['class', 'style', 'as', 'asChild', 'children']);

  const localRef = (node: HTMLElement | null) => {
    if (!node) {
      return;
    }

    if (hasRegistered() && index() === 0) {
      firstItemTextRef.current = node;
    }
    if (hasRegistered() && selectedByFocus()) {
      selectedItemTextRef.current = node;
    }
  };

  return renderElement('div', componentProps, {
    defaultClass: 'wheel-Select-ItemText',
    slot: 'select-item-text',
    ref: [
      localRef,
      (el: HTMLElement | null) => {
        textRef.current = el;
      },
    ],
    props: elementProps,
  });
}

export interface SelectItemTextState {}

export interface SelectItemTextProps extends BaseUIComponentProps<'div', SelectItemTextState> {}

export namespace SelectItemText {
  export type State = SelectItemTextState;
  export type Props = SelectItemTextProps;
}
