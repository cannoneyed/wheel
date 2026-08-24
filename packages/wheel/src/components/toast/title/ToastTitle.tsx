/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createEffect, onCleanup, splitProps, type JSX } from 'solid-js';
import type { BaseUIComponentProps } from '../../internals/types';
import { useToastRootContext } from '../root/ToastRootContext';
import { renderElement } from '../../internals/renderElement';
import { createBaseUiId } from '../../internals/createBaseUiId';

/**
 * A title that labels the toast.
 * Renders an `<h2>` element.
 *
 * Documentation: [Base UI Toast](https://base-ui.com/react/components/toast)
 */
export function ToastTitle(componentProps: ToastTitle.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'id',
  ]);

  const context = useToastRootContext();

  // `Toast.Title` never uses the `asChild` render-function form of `children`, so this narrows
  // `BaseUIComponentProps`'s wider `JSX.Element | AsChildRenderFn<State>` union down to the plain
  // element shape `params.children` (an `Accessor<JSX.Element>`) expects.
  const children = (): JSX.Element => (local.children as JSX.Element | undefined) ?? context.toast.title;
  const shouldRender = () => Boolean(children());

  const id = createBaseUiId(() => local.id);

  createEffect(() => {
    if (!shouldRender()) {
      return;
    }

    context.setTitleId(id());
    onCleanup(() => {
      context.setTitleId(undefined);
    });
  });

  const state: ToastTitleState = {
    get type() {
      return context.toast.type;
    },
  };

  return renderElement('h2', componentProps, {
    defaultClass: 'wheel-Toast-Title',
    slot: 'toast-title',
    state,
    props: [() => ({ id: id() }), elementProps],
    // `renderElement` strips a `children` key from the `props` array (it's not a DOM attribute);
    // the rendered content must come through this dedicated accessor instead.
    children,
    enabled: () => shouldRender(),
  });
}

export interface ToastTitleState {
  /**
   * The type of the toast.
   */
  type: string | undefined;
}

export interface ToastTitleProps extends BaseUIComponentProps<'h2', ToastTitleState> {}

export namespace ToastTitle {
  export type State = ToastTitleState;
  export type Props = ToastTitleProps;
}
