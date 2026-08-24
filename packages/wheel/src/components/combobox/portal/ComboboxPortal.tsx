/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-tracked-show -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
import { Show, splitProps, type JSX } from 'solid-js';
import { useComboboxRootContext } from '../root/ComboboxRootContext';
import { ComboboxPortalContext } from './ComboboxPortalContext';
import { FloatingPortal } from '../../floating-ui-solid';
import type { BaseUIComponentProps } from '../../internals/types';

/**
 * A portal element that moves the popup to a different part of the DOM.
 * By default, the portal element is appended to `<body>`.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Combobox](https://base-ui.com/react/components/combobox)
 */
export function ComboboxPortal(componentProps: ComboboxPortal.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'container',
    'keepMounted',
  ]);

  const store = useComboboxRootContext();
  const mounted = store.useState('mounted');
  const forceMounted = store.useState('forceMounted');
  const keepMounted = () => local.keepMounted ?? false;

  const shouldRender = () => mounted() || keepMounted() || forceMounted();

  return (
    <Show when={shouldRender()}>
      <ComboboxPortalContext.Provider value={true}>
        <FloatingPortal {...(elementProps as any)} container={local.container}>
          {local.children}
        </FloatingPortal>
      </ComboboxPortalContext.Provider>
    </Show>
  );
}

export interface ComboboxPortalState {}

export interface ComboboxPortalProps extends BaseUIComponentProps<'div', ComboboxPortalState> {
  container?: HTMLElement | ShadowRoot | null | undefined;
  /**
   * Whether to keep the portal mounted in the DOM while the popup is hidden.
   * @default false
   */
  keepMounted?: boolean | undefined;
}

export namespace ComboboxPortal {
  export type State = ComboboxPortalState;
  export type Props = ComboboxPortalProps;
}
