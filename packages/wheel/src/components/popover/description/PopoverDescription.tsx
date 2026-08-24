/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import type { BaseUIComponentProps } from '../../internals/types';
import { usePopoverRootContext } from '../root/PopoverRootContext';
import { renderElement } from '../../internals/renderElement';
import { createBaseUiId } from '../../internals/createBaseUiId';

/**
 * A paragraph with additional information about the popover.
 * Renders a `<p>` element.
 *
 * Documentation: [Base UI Popover](https://base-ui.com/react/components/popover)
 */
export function PopoverDescription(componentProps: PopoverDescription.Props): JSX.Element {
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

  store.syncValueWithCleanup('descriptionElementId', id);

  return renderElement('p', componentProps, {
    defaultClass: 'wheel-Popover-Description',
    slot: 'popover-description',
    props: [() => ({ id: id() }), elementProps],
  });
}

export interface PopoverDescriptionState {}

export interface PopoverDescriptionProps
  extends BaseUIComponentProps<'p', PopoverDescriptionState> {}

export namespace PopoverDescription {
  export type State = PopoverDescriptionState;
  export type Props = PopoverDescriptionProps;
}
