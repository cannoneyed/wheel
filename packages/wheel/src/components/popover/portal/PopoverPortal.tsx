/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-tracked-show -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
import { Show, splitProps, type JSX } from 'solid-js';
import { usePopoverRootContext } from '../root/PopoverRootContext';
import { PopoverPortalContext } from './PopoverPortalContext';
import { FloatingPortal } from '../../floating-ui-solid';
import { type BaseUIComponentProps, type MaybeAccessor } from '../../internals/types';

/**
 * A portal element that moves the popup to a different part of the DOM.
 * By default, the portal element is appended to `<body>`.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Popover](https://base-ui.com/react/components/popover)
 *
 * Deviation: this now renders through the full `FloatingPortal` (previously used the
 * stripped-down `useFloatingPortalNode` directly, mirroring `Tooltip.Portal`'s "never traps
 * focus" simplification). Popover needs `FloatingPortal`'s "outside" focus-guard coordination —
 * without it, `usePortalContext()` resolves to `null` inside `FloatingFocusManager`, so its own
 * non-modal inside guards never render (`shouldRenderGuards` requires `isInsidePortal || modal`),
 * and `Popover.Trigger`'s own after-trigger `FocusGuard` never gets a bounce back from the popup
 * when tabbing forward — matching `Dialog.Portal`'s doc comment on the same fix.
 */
export function PopoverPortal(componentProps: PopoverPortal.Props): JSX.Element {
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

  const store = usePopoverRootContext();
  const mounted = store.useState('mounted');
  const shouldRender = () => mounted() || keepMounted();

  return (
    <Show when={shouldRender()}>
      {/* `keepMounted` is a static-per-portal-instance config flag, not expected to change after
          mount; read once here to seed the context value (mirrors `TooltipPortal`). */}
      <PopoverPortalContext.Provider value={keepMounted()}>
        <FloatingPortal container={local.container} {...elementProps}>
          {local.children as JSX.Element}
        </FloatingPortal>
      </PopoverPortalContext.Provider>
    </Show>
  );
}

export interface PopoverPortalState {}

export interface PopoverPortalProps extends BaseUIComponentProps<'div', PopoverPortalState> {
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

export namespace PopoverPortal {
  export type State = PopoverPortalState;
  export type Props = PopoverPortalProps;
}
