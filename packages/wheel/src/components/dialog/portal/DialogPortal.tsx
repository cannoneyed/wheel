/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-tracked-show -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
import { Show, splitProps, type JSX } from 'solid-js';
import { inertValue } from '../../base-utils/inertValue';
import { useDialogRootContext } from '../root/DialogRootContext';
import { DialogPortalContext } from './DialogPortalContext';
import { FloatingPortal } from '../../floating-ui-solid';
import { InternalBackdrop } from '../../utils/InternalBackdrop';
import type { MaybeAccessor } from '../../internals/types';

/**
 * A portal element that moves the popup to a different part of the DOM.
 * By default, the portal element is appended to `<body>`.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Dialog](https://base-ui.com/react/components/dialog)
 *
 * Deviation: upstream renders through the full `FloatingPortal` (unlike `Tooltip.Portal`, which
 * uses the stripped-down `useFloatingPortalNode` directly, since tooltips never trap focus) — this
 * does the same, since dialogs can be modal and rely on `FloatingPortal`'s non-modal focus-guard
 * coordination with `FloatingFocusManager`.
 */
export function DialogPortal(componentProps: DialogPortal.Props): JSX.Element {
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

  const store = useDialogRootContext();
  const mounted = store.useState('mounted');
  const modal = store.useState('modal');
  const open = store.useState('open');

  const shouldRender = () => mounted() || keepMounted();

  return (
    <Show when={shouldRender()}>
      {/* `keepMounted` is a static-per-portal-instance config flag (mirrors upstream's plain
          `keepMounted` prop value), not expected to change after mount; read once here to seed
          the context value (matches `Tooltip.Portal`). */}
      <DialogPortalContext.Provider value={keepMounted()}>
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
      </DialogPortalContext.Provider>
    </Show>
  );
}

export interface DialogPortalState {}

export interface DialogPortalProps extends FloatingPortal.Props {
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

export namespace DialogPortal {
  export type State = DialogPortalState;
  export type Props = DialogPortalProps;
}
