/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createEffect, Show, untrack, type Accessor, type JSX } from 'solid-js';
import { TooltipRootContext } from './TooltipRootContext';
import { useClientPoint, useDismiss } from '../../floating-ui-solid';
import {
  createChangeEventDetails,
  type BaseUIChangeEventDetails,
} from '../../internals/createBaseUIEventDetails';
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
import { TooltipStore, type State as TooltipStoreState } from '../store/TooltipStore';

/**
 * Groups all parts of the tooltip.
 * Doesn't render its own HTML element.
 *
 * Documentation: [Base UI Tooltip](https://base-ui.com/react/components/tooltip)
 *
 * Deviation: upstream also accepts a `handle` prop (associating detached `Tooltip.Trigger`s
 * outside this tree) and an `actionsRef` (imperative `unmount`/`close`). Neither is ported — see
 * `utils/popups/popupStoreUtils.ts`'s `createPopupRootStore` doc comment for the `handle` deviation;
 * `actionsRef` is a React ref-forwarding pattern with no direct Solid equivalent, and no behavior in
 * the ported test slice exercises it. `forceUnmount`/`store.setOpen(false, ...)` remain reachable
 * through the store itself for a future imperative API if one is added.
 */
export function TooltipRoot<Payload = unknown>(props: TooltipRoot.Props<Payload>): JSX.Element {
  const disabled = () => props.disabled ?? false;
  const trackCursorAxis = () => props.trackCursorAxis ?? 'none';
  const disableHoverablePopup = () => props.disableHoverablePopup ?? false;

  const store = createPopupRootStore<TooltipStoreState<Payload>, TooltipStore<Payload>>(
    (floatingId, nested) =>
      new TooltipStore<Payload>(
        untrack(() => ({
          open: props.defaultOpen ?? false,
          openProp: props.open,
          activeTriggerId: props.defaultTriggerId ?? null,
          triggerIdProp: props.triggerId,
        })),
        floatingId,
        nested,
      ),
  );

  // These arguments are read from inside `store.syncValue`, which wraps them in a
  // `createComputed` internally — the lint rule can't trace through that custom API, so it
  // (incorrectly) flags them as untracked reads (same false positive documented in
  // `floating-ui-solid/hooks/useFloating.ts`).
  store.syncValue('openProp', () => props.open);
  store.syncValue('triggerIdProp', () => props.triggerId);

  // Plain function assignments to non-reactive `context` slots, invoked later from event
  // handlers/effects — not a tracked-scope read, so the lint rule's warning is a false positive.
  store.context.onOpenChange = (open, eventDetails) => {
    props.onOpenChange?.(open, eventDetails);
  };
  store.context.onOpenChangeComplete = (open) => {
    props.onOpenChangeComplete?.(open);
  };

  const openState = store.useState('open');
  const open = () => !disabled() && openState();

  const activeTriggerId = store.useState('activeTriggerId');
  const mounted = store.useState('mounted');
  const payload = store.useState('payload') as Accessor<Payload | undefined>;

  createSyncedValues(store, () => ({
    trackCursorAxis: trackCursorAxis(),
    disableHoverablePopup: disableHoverablePopup(),
  }));

  store.syncValue('disabled', disabled);

  createImplicitActiveTrigger(store, { closeOnActiveTriggerUnmount: true });
  const { transitionStatus } = createOpenStateTransitions(open, store);
  const isInstantPhase = store.useState('isInstantPhase');
  const instantType = store.useState('instantType');
  const lastOpenChangeReason = store.useState('lastOpenChangeReason');

  // Animations should be instant in two cases:
  // 1) Opening during the provider's instant phase (adjacent tooltip opens instantly)
  // 2) Closing because another tooltip opened (reason === 'none')
  // Otherwise, allow the animation to play. In particular, do not disable animations
  // during the 'ending' phase unless it's due to a sibling opening.
  let previousInstantType: string | undefined | null = null;

  createEffect(() => {
    if (openState() && disabled()) {
      store.setOpen(false, createChangeEventDetails(REASONS.disabled));
    }
  });

  createEffect(() => {
    const status = transitionStatus();
    const instant = isInstantPhase();
    const reason = lastOpenChangeReason();
    const currentInstantType = instantType();

    if ((status === 'ending' && reason === REASONS.none) || (status !== 'ending' && instant)) {
      // Capture the current instant type so we can restore it later
      // and set to 'delay' to disable animations while moving from one trigger to another
      // within a delay group.
      if (currentInstantType !== 'delay') {
        previousInstantType = currentInstantType;
      }
      store.set('instantType', 'delay');
    } else if (previousInstantType !== null) {
      store.set('instantType', previousInstantType as TooltipStoreState<Payload>['instantType']);
      previousInstantType = null;
    }
  });

  createEffect(() => {
    if (open() && activeTriggerId() == null) {
      store.set('payload', undefined);
    }
  });

  const shouldRenderInteractions = () =>
    open() || mounted() || (!disabled() && trackCursorAxis() !== 'none');

  return (
    <TooltipRootContext.Provider value={store as TooltipRootContext}>
      <Show when={shouldRenderInteractions()}>
        <TooltipInteractions
          store={store}
          disabled={disabled}
          trackCursorAxis={trackCursorAxis}
        />
      </Show>
      <TooltipRootChildren payload={payload}>{props.children}</TooltipRootChildren>
    </TooltipRootContext.Provider>
  );
}

/**
 * Renders `TooltipRoot`'s `children` — either plain JSX, or a payload-receiving render function.
 *
 * Split into its own component (rather than inlined as `typeof props.children === 'function' ? ... :
 * props.children` directly in `TooltipRoot`'s JSX) so `props.children` is read exactly once. Solid
 * (re-)constructs a JSX `children` value's underlying element/component tree on every access of the
 * `children` getter; reading it twice (once for a `typeof` check, once again for the branch's value)
 * mounts two independent copies of everything underneath — including any descendant with a mounting
 * side effect such as `<Tooltip.Portal>`, which inserts into `document.body` as soon as it's
 * constructed, regardless of whether the surrounding ternary's discarded branch is ever used.
 */
// Deviation: upstream re-evaluates `children({ payload })` on every render, so a render-function
// `children` reactively reflects `payload` changes over time. This component's body runs once
// (Solid semantics), so the render function is only called once, with the `payload` value at that
// moment — it will not re-render on a later payload change while the same trigger stays mounted.
// Only the render-function form of `children` is affected; plain JSX children are unaffected. No
// test in this port's slice exercises a live payload change under a render-function child; flagged
// here as a known limitation rather than silently accepted.
function TooltipRootChildren<Payload>(props: {
  children?: JSX.Element | TooltipRoot.PayloadChildRenderFunction<Payload>;
  payload: Accessor<Payload | undefined>;
}): JSX.Element {
  // Deliberately read once, not inside a tracked scope — see the deviation note above.
  const childrenValue = props.children;
  if (typeof childrenValue === 'function') {
    return (childrenValue as TooltipRoot.PayloadChildRenderFunction<Payload>)({
      payload: props.payload(),
    });
  }
  return childrenValue as JSX.Element;
}

function TooltipInteractions<Payload>(props: {
  store: TooltipStore<Payload>;
  disabled: Accessor<boolean>;
  trackCursorAxis: Accessor<'none' | 'x' | 'y' | 'both'>;
}): JSX.Element {
  // `store` is a stable object reference for this component's lifetime (never swapped), not a
  // reactive value — safe to read once outside a tracked scope.
  const store = props.store;
  const floatingRootContext = store.state.floatingRootContext;

  const dismiss = useDismiss(floatingRootContext, {
    enabled: () => !props.disabled(),
    referencePress: () => store.useState('closeOnClick')(),
  });
  const clientPoint = useClientPoint(floatingRootContext, {
    enabled: () => !props.disabled() && props.trackCursorAxis() !== 'none',
    axis: () => {
      const axisValue = props.trackCursorAxis();
      return axisValue === 'none' ? undefined : axisValue;
    },
  });

  const activeTriggerProps = mergeProps(clientPoint.reference, dismiss.reference);
  const inactiveTriggerProps = mergeProps(clientPoint.trigger, dismiss.trigger);
  const popupProps = mergeProps(FOCUSABLE_POPUP_PROPS, clientPoint.floating, dismiss.floating);

  createPopupInteractionProps(store, () => ({
    activeTriggerProps,
    inactiveTriggerProps,
    popupProps,
  }));

  return undefined as unknown as JSX.Element;
}

export interface TooltipRootState {}

export interface TooltipRootProps<Payload = unknown> {
  /**
   * Whether the tooltip is initially open.
   *
   * To render a controlled tooltip, use the `open` prop instead.
   * @default false
   */
  defaultOpen?: boolean | undefined;
  /**
   * Whether the tooltip is currently open.
   */
  open?: boolean | undefined;
  /**
   * Event handler called when the tooltip is opened or closed.
   */
  onOpenChange?:
    | ((open: boolean, eventDetails: TooltipRoot.ChangeEventDetails) => void)
    | undefined;
  /**
   * Event handler called after any animations complete when the tooltip is opened or closed.
   */
  onOpenChangeComplete?: ((open: boolean) => void) | undefined;
  /**
   * Whether the tooltip contents can be hovered without closing the tooltip.
   * @default false
   */
  disableHoverablePopup?: boolean | undefined;
  /**
   * Determines which axis the tooltip should track the cursor on.
   * @default 'none'
   */
  trackCursorAxis?: 'none' | 'x' | 'y' | 'both' | undefined;
  /**
   * Whether the tooltip is disabled.
   * @default false
   */
  disabled?: boolean | undefined;
  /**
   * The content of the tooltip.
   * This can be a regular Solid element or a render function that receives the `payload` of the
   * active trigger.
   */
  children?: JSX.Element | TooltipRoot.PayloadChildRenderFunction<Payload>;
  /**
   * ID of the trigger that the tooltip is associated with.
   * This is useful in conjunction with the `open` prop to create a controlled tooltip.
   * There's no need to specify this prop when the tooltip is uncontrolled (that is, when the `open` prop is not set).
   */
  triggerId?: string | null | undefined;
  /**
   * ID of the trigger that the tooltip is associated with.
   * This is useful in conjunction with the `defaultOpen` prop to create an initially open tooltip.
   */
  defaultTriggerId?: string | null | undefined;
}

export type TooltipRootChangeEventReason =
  | typeof REASONS.triggerHover
  | typeof REASONS.triggerFocus
  | typeof REASONS.triggerPress
  | typeof REASONS.outsidePress
  | typeof REASONS.escapeKey
  | typeof REASONS.disabled
  | typeof REASONS.imperativeAction
  | typeof REASONS.none;

export type TooltipRootChangeEventDetails =
  BaseUIChangeEventDetails<TooltipRootChangeEventReason> & {
    preventUnmountOnClose(): void;
  };

export namespace TooltipRoot {
  export type State = TooltipRootState;
  export type Props<Payload = unknown> = TooltipRootProps<Payload>;
  export type ChangeEventReason = TooltipRootChangeEventReason;
  export type ChangeEventDetails = TooltipRootChangeEventDetails;
  export type PayloadChildRenderFunction<Payload> = (arg: {
    payload: Payload | undefined;
  }) => JSX.Element;
}
