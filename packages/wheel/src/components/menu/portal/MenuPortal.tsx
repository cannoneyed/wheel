/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-tracked-show -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
import { splitProps, Show, type JSX } from 'solid-js';
import { FloatingPortal } from '../../floating-ui-solid';
import { useMenuRootContext } from '../root/MenuRootContext';
import { MenuPortalContext } from './MenuPortalContext';
import type { BaseUIComponentProps } from '../../internals/types';

/**
 * A portal element that moves the popup to a different part of the DOM.
 * By default, the portal element is appended to `<body>`.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Menu](https://base-ui.com/react/components/menu)
 */
export function MenuPortal(componentProps: MenuPortal.Props): JSX.Element {
  const [local, portalProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'keepMounted',
    'container',
  ]);

  const { store } = useMenuRootContext();
  const mounted = store.useState('mounted');

  const keepMounted = () => local.keepMounted ?? false;
  const shouldRender = () => mounted() || keepMounted();

  return (
    <Show when={shouldRender()}>
      {/* `keepMounted` is read once per mount, matching upstream's plain (non-reactive) boolean
          context value — the whole subtree only exists while `shouldRender()` is true anyway. */}
      <MenuPortalContext.Provider value={keepMounted()}>
        <FloatingPortal {...portalProps} container={local.container}>
          {local.children}
        </FloatingPortal>
      </MenuPortalContext.Provider>
    </Show>
  );
}

export interface MenuPortalState {}

export interface MenuPortalProps extends BaseUIComponentProps<'div', MenuPortalState> {
  /**
   * A parent element to render the portal element into.
   */
  container?: HTMLElement | ShadowRoot | null | undefined;
  /**
   * Whether to keep the portal mounted in the DOM while the popup is hidden.
   * @default false
   */
  keepMounted?: boolean | undefined;
}

export namespace MenuPortal {
  export type State = MenuPortalState;
  export type Props = MenuPortalProps;
}
