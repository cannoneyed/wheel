/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { useSignal } from '../../../core/local-state';
import { createEffect, onCleanup, Show, untrack, type Accessor, type JSX } from 'solid-js';
import { EMPTY_OBJECT } from '../../base-utils/empty';
import { DialogRootContext, useDialogRootContext } from './DialogRootContext';
import { contains, getTarget, useDismiss } from '../../floating-ui-solid';
import { createScrollLock } from '../../utils/createScrollLock';
import { type BaseUIChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import {
  createImplicitActiveTrigger,
  createOpenStateTransitions,
  createPopupInteractionProps,
  createPopupRootStore,
  createSyncedValues,
} from '../../utils/popups';
import { DialogStore, type State as DialogStoreState, type Context as DialogStoreContext } from '../store/DialogStore';

export type DialogRootMode = 'dialog' | 'alert-dialog';

/**
 * Groups all parts of the dialog.
 * Doesn't render its own HTML element.
 *
 * Documentation: [Base UI Dialog](https://base-ui.com/react/components/dialog)
 *
 * Deviation: upstream also accepts a `handle` prop (associating detached `Dialog.Trigger`s outside
 * this tree) and an `actionsRef` (imperative `unmount`/`close`). Neither is ported — see
 * `utils/popups/popupStoreUtils.ts`'s `createPopupRootStore` doc comment for the `handle` deviation
 * (same reasoning as `TooltipRoot`); `actionsRef` is a React ref-forwarding pattern with no direct
 * Solid equivalent, and no behavior in the ported test slice exercises it.
 *
 * Deviation: upstream also supports a `'drawer'` mode (via an internal `IsDrawerContext`) shared by
 * this same render path — `Drawer` isn't ported, so `renderDialogRoot` only takes `'dialog'` /
 * `'alert-dialog'` and the `IsDrawerContext` plumbing is dropped entirely (nothing else needs it).
 */
export function DialogRoot<Payload>(props: DialogRoot.Props<Payload>): JSX.Element {
  return renderDialogRoot(props, 'dialog');
}

/**
 * Shared render implementation for `Dialog.Root` and `AlertDialog.Root` — mirrors upstream's
 * `useRenderDialogRoot`, parameterized by `mode` instead of context-detected drawer/alert-dialog
 * flags (`AlertDialogRoot` in `alert-dialog/root/AlertDialogRoot.tsx` passes `'alert-dialog'`).
 */
export function renderDialogRoot<Payload>(
  props: DialogRoot.Props<Payload>,
  mode: DialogRootMode,
): JSX.Element {
  const isAlertDialog = mode === 'alert-dialog';
  const modal = () => (isAlertDialog ? true : (props.modal ?? true));
  const disablePointerDismissal = () => isAlertDialog || (props.disablePointerDismissal ?? false);
  const role: 'dialog' | 'alertdialog' = isAlertDialog ? 'alertdialog' : 'dialog';

  // Read once at setup time: Solid resolves context at creation, and a Root's nesting relationship
  // to an ancestor Root doesn't change over its lifetime.
  const parentDialogRootContext = untrack(() => useDialogRootContext(true));
  const isNestedDialog = parentDialogRootContext !== undefined;

  const store = createPopupRootStore<DialogStoreState<Payload>, DialogStore<Payload>>(
    (floatingId, floatingNested) =>
      new DialogStore<Payload>(
        untrack(() => ({
          open: props.defaultOpen ?? false,
          openProp: props.open,
          activeTriggerId: props.defaultTriggerId ?? null,
          triggerIdProp: props.triggerId,
          modal: modal(),
          disablePointerDismissal: disablePointerDismissal(),
          nested: isNestedDialog,
          role,
        })),
        floatingId,
        floatingNested,
      ),
    true,
  );

  store.syncValue('openProp', () => props.open);
  store.syncValue('triggerIdProp', () => props.triggerId);

  store.context.onOpenChange = (open, eventDetails) => {
    props.onOpenChange?.(open, eventDetails);
  };
  store.context.onOpenChangeComplete = (open) => {
    props.onOpenChangeComplete?.(open);
  };

  createSyncedValues(store, () => ({
    modal: modal(),
    disablePointerDismissal: disablePointerDismissal(),
    nested: isNestedDialog,
    role,
  }));

  const open = store.useState('open');
  const mounted = store.useState('mounted');
  const payload = store.useState('payload') as Accessor<Payload | undefined>;

  createImplicitActiveTrigger(store);
  createOpenStateTransitions(open, store);

  // Solid port of upstream's `usePopupRootSync`: reset `openMethod` once the dialog closes (and on
  // teardown), local to Dialog since `openMethod` isn't part of the shared `PopupStoreState`.
  createEffect(() => {
    if (!open() && store.state.openMethod !== null) {
      store.set('openMethod', null);
    }
  });
  onCleanup(() => {
    if (store.state.openMethod !== null) {
      store.set('openMethod', null);
    }
  });

  const shouldRenderInteractions = () => open() || mounted();

  return (
    <DialogRootContext.Provider value={store as DialogRootContext}>
      <Show when={shouldRenderInteractions()}>
        <DialogInteractions store={store} parentContext={parentDialogRootContext?.context} />
      </Show>
      <DialogRootChildren payload={payload}>{props.children}</DialogRootChildren>
    </DialogRootContext.Provider>
  );
}

/**
 * Renders `Dialog.Root`'s `children` — either plain JSX, or a payload-receiving render function.
 * See `TooltipRootChildren`'s doc comment (`tooltip/root/TooltipRoot.tsx`) for why this must be a
 * separate component that reads `props.children` exactly once.
 */
// Deviation: as with `TooltipRootChildren`, a render-function `children` is only invoked once (at
// this component's single setup pass) rather than reactively on every `payload` change.
function DialogRootChildren<Payload>(props: {
  children?: JSX.Element | DialogRoot.PayloadChildRenderFunction<Payload>;
  payload: Accessor<Payload | undefined>;
}): JSX.Element {
  const childrenValue = props.children;
  if (typeof childrenValue === 'function') {
    return (childrenValue as DialogRoot.PayloadChildRenderFunction<Payload>)({
      payload: props.payload(),
    });
  }
  return childrenValue as JSX.Element;
}

/**
 * Sets up dismiss interactions (escape/outside press), scroll lock, and nested-dialog-count
 * tracking. Solid port of upstream's `DialogInteractions`.
 */
function DialogInteractions<Payload>(props: {
  store: DialogStore<Payload>;
  parentContext: DialogStoreContext | undefined;
}): JSX.Element {
  // `store` is a stable object reference for this component's lifetime — safe to read once
  // outside a tracked scope, same rationale as `TooltipInteractions`.
  const store = props.store;
  const floatingRootContext = store.state.floatingRootContext;

  const open = store.useState('open');
  const disablePointerDismissal = store.useState('disablePointerDismissal');
  const modal = store.useState('modal');
  const popupElement = store.useState('popupElement');

  const [ownNestedOpenDialogs, setOwnNestedOpenDialogs] = useSignal(0, 'ownNestedOpenDialogs');
  const [ownNestedOpenDrawers, setOwnNestedOpenDrawers] = useSignal(0, 'ownNestedOpenDrawers');
  const isTopmost = () => ownNestedOpenDialogs() === 0;

  const dismiss = useDismiss(floatingRootContext, {
    outsidePressEvent: () => {
      if (store.context.internalBackdropRef.current || store.context.backdropRef.current) {
        return 'intentional';
      }
      // Ensures `aria-hidden` on outside elements is removed immediately
      // on outside press when trapping focus.
      return {
        mouse: modal() === 'trap-focus' ? 'sloppy' : 'intentional',
        touch: 'sloppy',
      };
    },
    // The inner event handler's reads (`disablePointerDismissal()`, `isTopmost()`, `modal()`,
    // `popupElement()`) are deliberately untracked — it runs later, at actual outside-press time,
    // and each option is meant to reflect its value at that moment rather than make this outer
    // accessor re-run when it changes (same rationale as `FloatingFocusManager`'s
    // `queueMicrotask`-deferred callbacks).
    outsidePress: () => (event: MouseEvent | PointerEvent | TouchEvent) => {
      // For mouse events, only accept left button (button 0)
      // For touch events, a single touch is equivalent to left button
      if ('button' in event && event.button !== 0) {
        return false;
      }
      if ('touches' in event) {
        // Outside press can be handled on `touchend`, where the lifted point is
        // reported in `changedTouches` and `touches` contains any remaining
        // active points. Treat it as a single-finger tap only when exactly one
        // touch ended and no other fingers are still down.
        if (event.type === 'touchend') {
          if (event.changedTouches.length !== 1 || event.touches.length !== 0) {
            return false;
          }
        } else if (event.touches.length !== 1) {
          return false;
        }
      }

      const target = getTarget(event) as Element | null;
      if (isTopmost() && !disablePointerDismissal()) {
        // Only close if the click occurred on the dialog's owning backdrop.
        // This supports multiple modal dialogs that aren't nested in the tree.
        if (modal()) {
          return store.context.internalBackdropRef.current || store.context.backdropRef.current
            ? store.context.internalBackdropRef.current === target ||
                store.context.backdropRef.current === target ||
                (contains(target, popupElement()) && !target?.hasAttribute('data-base-ui-portal'))
            : true;
        }
        return true;
      }
      return false;
    },
    escapeKey: isTopmost,
  });

  createScrollLock(
    () => open() && modal() === true,
    () => popupElement(),
  );

  // Plain function assignments to non-reactive `context` slots, invoked later by a nested Root's
  // effect below — not a tracked-scope read, so the lint rule's warning is a false positive (same
  // pattern as `store.context.onOpenChange` assignments elsewhere in this port).
  store.context.onNestedDialogOpen = (dialogCount, drawerCount) => {
    setOwnNestedOpenDialogs(dialogCount);
    setOwnNestedOpenDrawers(drawerCount);
  };
  store.context.onNestedDialogClose = () => {
    setOwnNestedOpenDialogs(0);
    setOwnNestedOpenDrawers(0);
  };

  // Notify the parent Root (if any) of this dialog's open/close state, using the parent's own
  // context callbacks. Re-runs whenever `open`/the nested counts change; the previous run's
  // cleanup (below) fires first, matching upstream's `useEffect` cleanup-then-rerun semantics.
  createEffect(() => {
    const isOpen = open();
    const dialogsCount = ownNestedOpenDialogs();
    const drawersCount = ownNestedOpenDrawers();

    if (props.parentContext?.onNestedDialogOpen && isOpen) {
      props.parentContext.onNestedDialogOpen(dialogsCount + 1, drawersCount);
    }
    if (props.parentContext?.onNestedDialogClose && !isOpen) {
      props.parentContext.onNestedDialogClose();
    }

    onCleanup(() => {
      if (props.parentContext?.onNestedDialogClose && isOpen) {
        props.parentContext.onNestedDialogClose();
      }
    });
  });

  const activeTriggerProps = dismiss.reference ?? EMPTY_OBJECT;
  const inactiveTriggerProps = dismiss.trigger ?? EMPTY_OBJECT;
  // Consumers (`DialogPopup`) already spread `FOCUSABLE_POPUP_PROPS` directly, so the popup props
  // only need to carry the dismiss handlers — matches upstream.
  const popupProps = dismiss.floating ?? EMPTY_OBJECT;

  createPopupInteractionProps(store, () => ({
    activeTriggerProps,
    inactiveTriggerProps,
    popupProps,
    nestedOpenDialogCount: ownNestedOpenDialogs(),
    nestedOpenDrawerCount: ownNestedOpenDrawers(),
  }));

  return undefined as unknown as JSX.Element;
}

export interface DialogRootState {}

export interface DialogRootProps<Payload = unknown> {
  /**
   * Whether the dialog is currently open.
   */
  open?: boolean | undefined;
  /**
   * Whether the dialog is initially open.
   *
   * To render a controlled dialog, use the `open` prop instead.
   * @default false
   */
  defaultOpen?: boolean | undefined;
  /**
   * Determines if the dialog enters a modal state when open.
   * - `true`: user interaction is limited to just the dialog: focus is trapped, document page scroll is locked, and pointer interactions on outside elements are disabled.
   * - `false`: user interaction with the rest of the document is allowed.
   * - `'trap-focus'`: focus is trapped inside the dialog, but document page scroll is not locked and pointer interactions outside of it remain enabled.
   *
   * When `modal` is `true` or `'trap-focus'`, render `<Dialog.Close>` inside `<Dialog.Popup>` so
   * touch screen readers can escape the popup.
   * @default true
   */
  modal?: boolean | 'trap-focus' | undefined;
  /**
   * Event handler called when the dialog is opened or closed.
   */
  onOpenChange?: ((open: boolean, eventDetails: DialogRoot.ChangeEventDetails) => void) | undefined;
  /**
   * Event handler called after any animations complete when the dialog is opened or closed.
   */
  onOpenChangeComplete?: ((open: boolean) => void) | undefined;
  /**
   * Whether to prevent the dialog from closing on outside presses.
   * For non-modal dialogs, this also prevents the dialog from closing when focus moves outside of it.
   * @default false
   */
  disablePointerDismissal?: boolean | undefined;
  /**
   * The content of the dialog.
   * This can be a regular Solid element or a render function that receives the `payload` of the
   * active trigger.
   */
  children?: JSX.Element | DialogRoot.PayloadChildRenderFunction<Payload>;
  /**
   * ID of the trigger that the dialog is associated with.
   * This is useful in conjunction with the `open` prop to create a controlled dialog.
   * There's no need to specify this prop when the dialog is uncontrolled (that is, when the `open` prop is not set).
   */
  triggerId?: string | null | undefined;
  /**
   * ID of the trigger that the dialog is associated with.
   * This is useful in conjunction with the `defaultOpen` prop to create an initially open dialog.
   */
  defaultTriggerId?: string | null | undefined;
}

export type DialogRootChangeEventReason =
  | typeof REASONS.triggerPress
  | typeof REASONS.outsidePress
  | typeof REASONS.escapeKey
  | typeof REASONS.closePress
  | typeof REASONS.focusOut
  | typeof REASONS.imperativeAction
  | typeof REASONS.none;

export type DialogRootChangeEventDetails = BaseUIChangeEventDetails<DialogRootChangeEventReason> & {
  preventUnmountOnClose(): void;
};

export namespace DialogRoot {
  export type State = DialogRootState;
  export type Props<Payload = unknown> = DialogRootProps<Payload>;
  export type ChangeEventReason = DialogRootChangeEventReason;
  export type ChangeEventDetails = DialogRootChangeEventDetails;
  export type PayloadChildRenderFunction<Payload> = (arg: {
    payload: Payload | undefined;
  }) => JSX.Element;
}
