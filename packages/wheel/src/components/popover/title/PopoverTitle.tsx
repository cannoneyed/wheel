/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import type { BaseUIComponentProps } from '../../internals/types';
import { usePopoverRootContext } from '../root/PopoverRootContext';
import { renderElement } from '../../internals/renderElement';
import { createBaseUiId } from '../../internals/createBaseUiId';

/**
 * A heading that labels the popover.
 * Renders an `<h2>` element.
 *
 * Documentation: [Base UI Popover](https://base-ui.com/react/components/popover)
 */
export function PopoverTitle(componentProps: PopoverTitle.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'id',
  ]);

  const store = usePopoverRootContext();

  const id = createBaseUiId(() => local.id);

  store.syncValueWithCleanup('titleElementId', id);

  return renderElement('h2', componentProps, {
    defaultClass: 'wheel-Popover-Title',
    slot: 'popover-title',
    props: [() => ({ id: id() }), elementProps],
  });
}

export interface PopoverTitleState {}

export interface PopoverTitleProps
  extends BaseUIComponentProps<'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6', PopoverTitleState> {}

export namespace PopoverTitle {
  export type State = PopoverTitleState;
  export type Props = PopoverTitleProps;
}
