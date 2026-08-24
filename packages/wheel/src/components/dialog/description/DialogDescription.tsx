/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import { useDialogRootContext } from '../root/DialogRootContext';
import { renderElement } from '../../internals/renderElement';
import { createBaseUiId } from '../../internals/createBaseUiId';
import type { BaseUIComponentProps } from '../../internals/types';

/**
 * A paragraph with additional information about the dialog.
 * Renders a `<p>` element.
 *
 * Documentation: [Base UI Dialog](https://base-ui.com/react/components/dialog)
 */
export function DialogDescription(componentProps: DialogDescription.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'id',
  ]);

  const store = useDialogRootContext();

  const id = createBaseUiId(() => local.id);

  store.syncValueWithCleanup('descriptionElementId', id);

  return renderElement('p', componentProps, {
    defaultClass: 'wheel-Dialog-Description',
    slot: 'dialog-description',
    props: [() => ({ id: id() }), elementProps],
  });
}

export interface DialogDescriptionProps extends BaseUIComponentProps<'p', DialogDescriptionState> {}

export interface DialogDescriptionState {}

export namespace DialogDescription {
  export type Props = DialogDescriptionProps;
  export type State = DialogDescriptionState;
}
