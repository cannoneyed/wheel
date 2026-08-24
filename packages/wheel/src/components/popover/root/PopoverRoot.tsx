/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createEffect, Show, untrack, type Accessor, type JSX } from 'solid-js';
import { PopoverRootContext, usePopoverRootContext } from './PopoverRootContext';
import { FloatingTree, useDismiss } from '../../floating-ui-solid';
import type { BaseUIChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import {
  createImplicitActiveTrigger,
  createOpenStateTransitions,
  createPopupInteractionProps,
  createPopupRootStore,
  createSyncedValues,
  FOCUSABLE_POPUP_PROPS,
} from '../../utils/popups';
import { mergeProps } from '../../merge-props/mergeProps';
import { PopoverStore, type State as PopoverStoreState } from '../store/PopoverStore';

/**
 * Groups all parts of the popover.
 * Doesn't render its own HTML element.
 *
 * Documentation: [Base UI Popover](https://base-ui.com/react/components/popover)
 *
 * Deviation: upstream also accepts a `handle` prop (associating detached `Popover.Trigger`s
 * outside this tree — `Popover.Handle`/`createHandle`) and an `actionsRef` (imperative
 * `unmount`/`close`). Neither is ported: `handle` is explicitly out of scope for this pass (see
 * `index.parts.ts`); `actionsRef` is a React ref-forwarding pattern with no direct Solid
 * equivalent and no behavior in this port's test slice exercises it — same cuts `TooltipRoot`
 * makes, see its doc comment.
 */
export function PopoverRoot<Payload = unknown>(props: PopoverRoot.Props<Payload>): JSX.Element {
  // Conditionally wraps in a `<FloatingTree>` when no ancestor `Popover.Root` already provides
  // one, so `useDismiss`'s escape/outside-press bubbling can coordinate between popovers that
  // aren't DOM-nested (e.g. a popover rendered inside another popover's popup). Reading
  // `usePopoverRootContext(true)` here — before this component's own JSX renders anything — sees
  // an ancestor `PopoverRootContext.Provider` only if one exists *outside* this call (a genuinely
  // different, already-rendered `Popover.Root`); it can never see the `PopoverRootContext.Provider`
  // this same call is about to render below, so this is safe from the self-referential ambient-
  // context pitfall documented on `MenuRoot.tsx`'s own `FloatingTree` wiring. Ancestor presence is
  // fixed at setup time (an ancestor `Popover.Root` can't appear later), so this `if` is a stable
  // choice between two render paths, not a reactive conditional — matching `Toggle.tsx`'s group-
  // membership check.
  if (usePopoverRootContext(true)) {
    return <PopoverRootComponent props={props} />;
  }

  return (
    <FloatingTree>
      <PopoverRootComponent props={props} />
    </FloatingTree>
  );
}

function PopoverRootComponent<Payload = unknown>(componentProps: {
  props: PopoverRoot.Props<Payload>;
}): JSX.Element {
  // Not a destructure: `componentProps` here only ever wraps one field (the real `Popover.Root`
  // props, passed through as-is from `PopoverRoot` above), and `.props` is read once to get a
  // stable handle on that (never-reassigned) props object — reactivity is preserved because every
  // downstream read still goes through `props.<field>` property access.
  const props = componentProps.props;
  const modal = () => props.modal ?? false;

  const store = createPopupRootStore<PopoverStoreState<Payload>, PopoverStore<Payload>>(
    (floatingId, nested) =>
      new PopoverStore<Payload>(
        untrack(() => ({
          open: props.defaultOpen ?? false,
          openProp: props.open,
          modal: modal(),
          activeTriggerId: props.defaultTriggerId ?? null,
          triggerIdProp: props.triggerId,
        })),
        floatingId,
        nested,
      ),
  );

  store.syncValue('openProp', () => props.open);
  store.syncValue('triggerIdProp', () => props.triggerId);

  store.context.onOpenChange = (open, eventDetails) => {
    props.onOpenChange?.(open, eventDetails);
  };
  store.context.onOpenChangeComplete = (open) => {
    props.onOpenChangeComplete?.(open);
  };

  const open = store.useState('open');
  const mounted = store.useState('mounted');
  const payload = store.useState('payload') as Accessor<Payload | undefined>;

  createImplicitActiveTrigger(store);
  createOpenStateTransitions(open, store, () => {
    store.update({ stickIfOpen: true, openChangeReason: null });
  });

  createSyncedValues(store, () => ({ modal: modal() }));

  createEffect(() => {
    if (!open()) {
      store.context.stickIfOpenTimeout.clear();
    }
  });

  const shouldRenderInteractions = () => open() || mounted();

  return (
    <PopoverRootContext.Provider value={store as PopoverRootContext}>
      <Show when={shouldRenderInteractions()}>
        <PopoverInteractions store={store} modal={modal} />
      </Show>
      <PopoverRootChildren payload={payload}>{props.children}</PopoverRootChildren>
    </PopoverRootContext.Provider>
  );
}

/**
 * Renders `PopoverRoot`'s `children` — either plain JSX, or a payload-receiving render function.
 * See `TooltipRootChildren`'s doc comment (`tooltip/root/TooltipRoot.tsx`) for why this must be a
 * separate component that reads `props.children` exactly once.
 */
// Deviation: as with `TooltipRootChildren`, a render-function `children` only captures `payload`
// at the moment this component's body runs (once), not reactively over time. No test in this
// port's slice exercises a live payload change under a render-function child.
function PopoverRootChildren<Payload>(props: {
  children?: JSX.Element | PopoverRoot.PayloadChildRenderFunction<Payload>;
  payload: Accessor<Payload | undefined>;
}): JSX.Element {
  const childrenValue = props.children;
  if (typeof childrenValue === 'function') {
    return (childrenValue as PopoverRoot.PayloadChildRenderFunction<Payload>)({
      payload: props.payload(),
    });
  }
  return childrenValue as JSX.Element;
}

function PopoverInteractions<Payload>(props: {
  store: PopoverStore<Payload>;
  modal: Accessor<boolean | 'trap-focus'>;
}): JSX.Element {
  // `store` is a stable object reference for this component's lifetime (never swapped), not a
  // reactive value — safe to read once outside a tracked scope.
  const store = props.store;
  const floatingRootContext = store.state.floatingRootContext;

  const dismiss = useDismiss(floatingRootContext, {
    outsidePressEvent: () => ({
      // Ensure `aria-hidden` on outside elements is removed immediately on outside press when
      // trapping focus.
      mouse: props.modal() === 'trap-focus' ? 'sloppy' : 'intentional',
      touch: 'sloppy',
    }),
  });

  const popupProps = mergeProps(FOCUSABLE_POPUP_PROPS, dismiss.floating);

  createPopupInteractionProps(store, () => ({
    activeTriggerProps: dismiss.reference ?? {},
    inactiveTriggerProps: dismiss.trigger ?? {},
    popupProps,
  }));

  return undefined as unknown as JSX.Element;
}

export interface PopoverRootState {}

export interface PopoverRootProps<Payload = unknown> {
  /**
   * Whether the popover is initially open.
   *
   * To render a controlled popover, use the `open` prop instead.
   * @default false
   */
  defaultOpen?: boolean | undefined;
  /**
   * Whether the popover is currently open.
   */
  open?: boolean | undefined;
  /**
   * Event handler called when the popover is opened or closed.
   */
  onOpenChange?:
    | ((open: boolean, eventDetails: PopoverRoot.ChangeEventDetails) => void)
    | undefined;
  /**
   * Event handler called after any animations complete when the popover is opened or closed.
   */
  onOpenChangeComplete?: ((open: boolean) => void) | undefined;
  /**
   * Determines if the popover enters a modal state when open.
   * - `true`: user interaction is limited to the popover: pointer interactions on outside
   *   elements are disabled and focus is trapped inside the popover.
   * - `false`: user interaction with the rest of the document is allowed.
   * - `'trap-focus'`: focus is trapped inside the popover, but pointer interactions outside of it
   *   remain enabled.
   * @default false
   */
  modal?: boolean | 'trap-focus' | undefined;
  /**
   * ID of the trigger that the popover is associated with.
   * This is useful in conjunction with the `open` prop to create a controlled popover.
   * There's no need to specify this prop when the popover is uncontrolled (that is, when the `open` prop is not set).
   */
  triggerId?: string | null | undefined;
  /**
   * ID of the trigger that the popover is associated with.
   * This is useful in conjunction with the `defaultOpen` prop to create an initially open popover.
   */
  defaultTriggerId?: string | null | undefined;
  /**
   * The content of the popover.
   * This can be a regular Solid element or a render function that receives the `payload` of the
   * active trigger.
   */
  children?: JSX.Element | PopoverRoot.PayloadChildRenderFunction<Payload>;
}

export type PopoverRootChangeEventReason =
  | typeof REASONS.triggerHover
  | typeof REASONS.triggerFocus
  | typeof REASONS.triggerPress
  | typeof REASONS.outsidePress
  | typeof REASONS.escapeKey
  | typeof REASONS.closePress
  | typeof REASONS.focusOut
  | typeof REASONS.imperativeAction
  | typeof REASONS.none;
export type PopoverRootChangeEventDetails =
  BaseUIChangeEventDetails<PopoverRoot.ChangeEventReason> & {
    preventUnmountOnClose(): void;
  };

export namespace PopoverRoot {
  export type State = PopoverRootState;
  export type Props<Payload = unknown> = PopoverRootProps<Payload>;
  export type ChangeEventReason = PopoverRootChangeEventReason;
  export type ChangeEventDetails = PopoverRootChangeEventDetails;
  export type PayloadChildRenderFunction<Payload> = (arg: {
    payload: Payload | undefined;
  }) => JSX.Element;
}
