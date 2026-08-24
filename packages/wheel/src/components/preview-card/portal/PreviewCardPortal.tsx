/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-tracked-show -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
import { Show, splitProps, type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';
import { usePreviewCardRootContext } from '../root/PreviewCardContext';
import { PreviewCardPortalContext } from './PreviewCardPortalContext';
import { useFloatingPortalNode } from '../../floating-ui-solid';
import { access, type BaseUIComponentProps, type MaybeAccessor } from '../../internals/types';

/**
 * A portal element that moves the popup to a different part of the DOM.
 * By default, the portal element is appended to `<body>`.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Preview Card](https://base-ui.com/react/components/preview-card)
 *
 * Deviation: upstream renders through `FloatingPortalLite` (a stripped-down `FloatingPortal`
 * without the tabbable/focus-guard machinery, since preview cards aren't modal). This calls
 * `useFloatingPortalNode` directly instead — the Solid port of that same underlying primitive —
 * rather than introducing a `FloatingPortalLite` wrapper with no other current caller, matching
 * `Tooltip.Portal`'s equivalent cut.
 */
export function PreviewCardPortal(componentProps: PreviewCardPortal.Props): JSX.Element {
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

  const store = usePreviewCardRootContext();
  const mounted = store.useState('mounted');
  const shouldRender = () => mounted() || keepMounted();

  const { portalNode, containerElement, renderPortalElement } = useFloatingPortalNode({
    container: () => access(local.container),
    componentProps,
    elementProps,
  });

  return (
    <Show when={shouldRender()}>
      {/* `keepMounted` is a static-per-portal-instance config flag (mirrors upstream's plain
          `keepMounted` prop value), not expected to change after mount; read once here to seed
          the context value. */}
      <PreviewCardPortalContext.Provider value={keepMounted()}>
        <Show when={containerElement()}>
          {(mount) => <Portal mount={mount()}>{renderPortalElement()}</Portal>}
        </Show>
        <Show when={portalNode()}>
          {(node) => <Portal mount={node()}>{local.children as JSX.Element}</Portal>}
        </Show>
      </PreviewCardPortalContext.Provider>
    </Show>
  );
}

export interface PreviewCardPortalState {}

export interface PreviewCardPortalProps extends BaseUIComponentProps<'div', PreviewCardPortalState> {
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

export namespace PreviewCardPortal {
  export type State = PreviewCardPortalState;
  export type Props = PreviewCardPortalProps;
}
