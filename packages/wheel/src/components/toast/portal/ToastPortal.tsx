/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { Show, splitProps, type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';
import { useFloatingPortalNode } from '../../floating-ui-solid';
import { access, type BaseUIComponentProps, type MaybeAccessor } from '../../internals/types';

/**
 * A portal element that moves the viewport to a different part of the DOM.
 * By default, the portal element is appended to `<body>`.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Toast](https://base-ui.com/react/components/toast)
 *
 * Deviation: upstream renders through `FloatingPortalLite` (a stripped-down `FloatingPortal`
 * without the tabbable/focus-guard machinery). This calls `useFloatingPortalNode` directly instead
 * — the Solid port of that same underlying primitive — rather than introducing a
 * `FloatingPortalLite` wrapper with no other current caller (mirrors `TooltipPortal`'s equivalent
 * deviation). Unlike `Popover.Portal`/`Tooltip.Portal`, this is never gated by a `mounted`/`open`
 * boolean — the toast viewport isn't tied to a single popup's open state, so the portal always
 * renders.
 */
export function ToastPortal(componentProps: ToastPortal.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'container',
  ]);

  const { portalNode, containerElement, renderPortalElement } = useFloatingPortalNode({
    container: () => access(local.container),
    componentProps,
    elementProps,
  });

  return (
    <>
      <Show when={containerElement()}>
        {(mount) => <Portal mount={mount()}>{renderPortalElement()}</Portal>}
      </Show>
      <Show when={portalNode()}>
        {(node) => <Portal mount={node()}>{local.children as JSX.Element}</Portal>}
      </Show>
    </>
  );
}

export interface ToastPortalState {}

export interface ToastPortalProps extends BaseUIComponentProps<'div', ToastPortalState> {
  /**
   * A parent element to render the portal element into.
   */
  container?: MaybeAccessor<HTMLElement | ShadowRoot | null | undefined>;
}

export namespace ToastPortal {
  export type State = ToastPortalState;
  export type Props = ToastPortalProps;
}
