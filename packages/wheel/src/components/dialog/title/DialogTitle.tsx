/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import { useDialogRootContext } from '../root/DialogRootContext';
import { renderElement } from '../../internals/renderElement';
import { createBaseUiId } from '../../internals/createBaseUiId';
import type { BaseUIComponentProps } from '../../internals/types';

/**
 * A heading that labels the dialog.
 * Renders an `<h2>` element.
 *
 * Documentation: [Base UI Dialog](https://base-ui.com/react/components/dialog)
 */
export function DialogTitle(componentProps: DialogTitle.Props): JSX.Element {
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

  store.syncValueWithCleanup('titleElementId', id);

  return renderElement('h2', componentProps, {
    defaultClass: 'wheel-Dialog-Title',
    slot: 'dialog-title',
    props: [() => ({ id: id() }), elementProps],
  });
}

export interface DialogTitleProps extends BaseUIComponentProps<'h2', DialogTitleState> {}

export interface DialogTitleState {}

export namespace DialogTitle {
  export type Props = DialogTitleProps;
  export type State = DialogTitleState;
}
