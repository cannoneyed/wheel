/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-tracked-show -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
import { Show, splitProps, type JSX } from 'solid-js';
import { inertValue } from '../../base-utils/inertValue';
import { useDrawerRootContext } from '../root/DrawerRootContext';
import { DrawerPortalContext } from './DrawerPortalContext';
import { FloatingPortal } from '../../floating-ui-solid';
import { InternalBackdrop } from '../../utils/InternalBackdrop';
import type { MaybeAccessor } from '../../internals/types';

/**
 * A portal element that moves the popup to a different part of the DOM.
 * By default, the portal element is appended to `<body>`.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Drawer](https://base-ui.com/react/components/drawer)
 *
 * Deviation: upstream re-exports `Dialog.Portal` directly (`export const DrawerPortal =
 * DialogPortal`) since Drawer shares `DialogStore`. This Solid port's Drawer owns a separate
 * `DrawerStore` (see `DrawerStore`'s doc comment), so this is its own component reading
 * `useDrawerRootContext()` instead — structurally identical to `DialogPortal` otherwise.
 */
export function DrawerPortal(componentProps: DrawerPortal.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'container',
    'keepMounted',
  ]);

  const keepMounted = () => local.keepMounted ?? false;

  const store = useDrawerRootContext();
  const mounted = store.useState('mounted');
  const modal = store.useState('modal');
  const open = store.useState('open');

  const shouldRender = () => mounted() || keepMounted();

  return (
    <Show when={shouldRender()}>
      <DrawerPortalContext.Provider value={keepMounted()}>
        <FloatingPortal container={local.container} {...elementProps}>
          <Show when={mounted() && modal() === true}>
            <InternalBackdrop
              ref={(el) => {
                store.context.internalBackdropRef.current = el;
              }}
              inert={inertValue(!open())}
            />
          </Show>
          {local.children as JSX.Element}
        </FloatingPortal>
      </DrawerPortalContext.Provider>
    </Show>
  );
}

export interface DrawerPortalState {}

export interface DrawerPortalProps extends FloatingPortal.Props {
  /**
   * Whether to keep the portal mounted in the DOM while the popup is hidden.
   * @default false
   */
  keepMounted?: boolean | undefined;
  /**
   * A parent element to render the portal element into.
   */
  container?: MaybeAccessor<HTMLElement | ShadowRoot | null | undefined> | undefined;
}

export namespace DrawerPortal {
  export type State = DrawerPortalState;
  export type Props = DrawerPortalProps;
}
