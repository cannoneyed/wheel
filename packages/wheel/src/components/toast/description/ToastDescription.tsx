/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createEffect, onCleanup, splitProps, type JSX } from 'solid-js';
import type { BaseUIComponentProps } from '../../internals/types';
import { useToastRootContext } from '../root/ToastRootContext';
import { renderElement } from '../../internals/renderElement';
import { createBaseUiId } from '../../internals/createBaseUiId';

/**
 * A description that describes the toast.
 * Can be used as the default message for the toast when no title is provided.
 * Renders a `<p>` element.
 *
 * Documentation: [Base UI Toast](https://base-ui.com/react/components/toast)
 */
export function ToastDescription(componentProps: ToastDescription.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'id',
  ]);

  const context = useToastRootContext();

  // `Toast.Description` never uses the `asChild` render-function form of `children`, so this
  // narrows `BaseUIComponentProps`'s wider `JSX.Element | AsChildRenderFn<State>` union down to the
  // plain element shape `params.children` (an `Accessor<JSX.Element>`) expects.
  const children = (): JSX.Element =>
    (local.children as JSX.Element | undefined) ?? context.toast.description;
  const shouldRender = () => Boolean(children());

  const id = createBaseUiId(() => local.id);

  createEffect(() => {
    if (!shouldRender()) {
      return;
    }

    context.setDescriptionId(id());
    onCleanup(() => {
      context.setDescriptionId(undefined);
    });
  });

  const state: ToastDescriptionState = {
    get type() {
      return context.toast.type;
    },
  };

  return renderElement('p', componentProps, {
    defaultClass: 'wheel-Toast-Description',
    slot: 'toast-description',
    state,
    props: [() => ({ id: id() }), elementProps],
    // `renderElement` strips a `children` key from the `props` array (it's not a DOM attribute);
    // the rendered content must come through this dedicated accessor instead.
    children,
    enabled: () => shouldRender(),
  });
}

export interface ToastDescriptionState {
  /**
   * The type of the toast.
   */
  type: string | undefined;
}

export interface ToastDescriptionProps extends BaseUIComponentProps<'p', ToastDescriptionState> {}

export namespace ToastDescription {
  export type State = ToastDescriptionState;
  export type Props = ToastDescriptionProps;
}
