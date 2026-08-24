/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-tracked-show -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
import { Show, splitProps, type JSX } from 'solid-js';
import { useNavigationMenuRootContext } from '../root/NavigationMenuRootContext';
import { NavigationMenuPortalContext } from './NavigationMenuPortalContext';
import { FloatingPortal } from '../../floating-ui-solid';
import { type BaseUIComponentProps, type MaybeAccessor } from '../../internals/types';

/**
 * A portal element that moves the popup to a different part of the DOM.
 * By default, the portal element is appended to `<body>`.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Navigation Menu](https://base-ui.com/react/components/navigation-menu)
 */
export function NavigationMenuPortal(componentProps: NavigationMenuPortal.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'ref',
    'container',
    'keepMounted',
  ]);

  const keepMounted = () => local.keepMounted ?? false;

  const { mounted } = useNavigationMenuRootContext();
  const shouldRender = () => mounted() || keepMounted();

  return (
    <Show when={shouldRender()}>
      {/* `keepMounted` is a static-per-portal-instance config flag, not expected to change after
          mount; read once here to seed the context value (mirrors upstream). */}
      <NavigationMenuPortalContext.Provider value={keepMounted()}>
        <FloatingPortal container={local.container} {...elementProps}>
          {local.children as JSX.Element}
        </FloatingPortal>
      </NavigationMenuPortalContext.Provider>
    </Show>
  );
}

export interface NavigationMenuPortalState {}

export interface NavigationMenuPortalProps
  extends BaseUIComponentProps<'div', NavigationMenuPortalState> {
  /**
   * A parent element to render the portal element into.
   */
  container?: MaybeAccessor<HTMLElement | ShadowRoot | null | undefined>;
  /**
   * Whether to keep the portal mounted in the DOM while the popup is hidden.
   * @default false
   */
  keepMounted?: boolean | undefined;
}

export namespace NavigationMenuPortal {
  export type State = NavigationMenuPortalState;
  export type Props = NavigationMenuPortalProps;
}
