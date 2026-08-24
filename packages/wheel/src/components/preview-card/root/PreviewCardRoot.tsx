/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createEffect, onCleanup, Show, untrack, type Accessor, type JSX } from 'solid-js';
import { PreviewCardRootContext } from './PreviewCardContext';
import { useDismiss } from '../../floating-ui-solid';
import type { BaseUIChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import {
  createImplicitActiveTrigger,
  createOpenStateTransitions,
  createPopupInteractionProps,
  createPopupRootStore,
  FOCUSABLE_POPUP_PROPS,
} from '../../utils/popups';
import { mergeProps } from '../../merge-props/mergeProps';
import { PreviewCardStore, type State as PreviewCardStoreState } from '../store/PreviewCardStore';
import type { PreviewCardHandle } from '../store/PreviewCardHandle';

/**
 * Groups all parts of the preview card.
 * Doesn't render its own HTML element.
 *
 * Documentation: [Base UI Preview Card](https://base-ui.com/react/components/preview-card)
 *
 * Deviation: upstream conditionally wraps in `<FloatingTree>` when no ancestor `PreviewCard.Root`
 * already provides one (so `useDismiss`'s escape/outside-press bubbling can coordinate between
 * preview cards that aren't DOM-nested). Not ported — same cut `PopoverRoot`'s doc comment makes,
 * for the same reasons (this port's test slice doesn't exercise multi-preview-card bubbling, and
 * `useFloatingNodeId`/`FloatingNode` both work standalone without a `FloatingTree` ancestor).
 *
 * Deviation: upstream also accepts an `actionsRef` (imperative `unmount`/`close`) — a React
 * ref-forwarding pattern with no direct Solid equivalent and no behavior in this port's test slice
 * exercises it (same cut `TooltipRoot`/`PopoverRoot` make). `forceUnmount`/`store.setOpen(false, ...)`
 * remain reachable through the store itself for a future imperative API if one is added.
 */
export function PreviewCardRoot<Payload = unknown>(
  props: PreviewCardRoot.Props<Payload>,
): JSX.Element {
  const store = createPopupRootStore<PreviewCardStoreState<Payload>, PreviewCardStore<Payload>>(
    (floatingId, nested) =>
      new PreviewCardStore<Payload>(
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

  // Attaches this root's store to `handle` (if provided), so detached `PreviewCard.Trigger`s
  // sharing the handle migrate their registration and interactions onto it. Reactive to a
  // changing `handle` prop. `PreviewCard.Trigger` mirrors this reactivity on its side (see its doc
  // comment) rather than resolving the handle's store once at setup, since a detached trigger can
  // mount before this effect (and any earlier root's) has attached.
  createEffect(() => {
    const handle = props.handle;
    if (!handle) {
      return;
    }
    const detach = (handle as PreviewCardHandle<Payload>).attachStore(store);
    onCleanup(detach);
  });

  const open = store.useState('open');
  const activeTriggerId = store.useState('activeTriggerId');
  const mounted = store.useState('mounted');
  const payload = store.useState('payload') as Accessor<Payload | undefined>;

  createImplicitActiveTrigger(store, { closeOnActiveTriggerUnmount: true });
  createOpenStateTransitions(open, store);

  createEffect(() => {
    if (open() && activeTriggerId() == null) {
      store.set('payload', undefined);
    }
  });

  const shouldRenderInteractions = () => open() || mounted();

  return (
    <PreviewCardRootContext.Provider value={store as PreviewCardRootContext}>
      <Show when={shouldRenderInteractions()}>
        <PreviewCardInteractions store={store} />
      </Show>
      <PreviewCardRootChildren payload={payload}>{props.children}</PreviewCardRootChildren>
    </PreviewCardRootContext.Provider>
  );
}

/**
 * Renders `PreviewCardRoot`'s `children` — either plain JSX, or a payload-receiving render
 * function. See `TooltipRootChildren`'s doc comment (`tooltip/root/TooltipRoot.tsx`) for why this
 * must be a separate component that reads `props.children` exactly once.
 */
// Deviation: as with `TooltipRootChildren`, a render-function `children` only captures `payload`
// at the moment this component's body runs (once), not reactively over time. No test in this
// port's slice exercises a live payload change under a render-function child.
function PreviewCardRootChildren<Payload>(props: {
  children?: JSX.Element | PreviewCardRoot.PayloadChildRenderFunction<Payload>;
  payload: Accessor<Payload | undefined>;
}): JSX.Element {
  // Deliberately read once, not inside a tracked scope — see the deviation note above.
  const childrenValue = props.children;
  if (typeof childrenValue === 'function') {
    return (childrenValue as PreviewCardRoot.PayloadChildRenderFunction<Payload>)({
      payload: props.payload(),
    });
  }
  return childrenValue as JSX.Element;
}

function PreviewCardInteractions<Payload>(props: {
  store: PreviewCardStore<Payload>;
}): JSX.Element {
  // `store` is a stable object reference for this component's lifetime (never swapped), not a
  // reactive value — safe to read once outside a tracked scope.
  const store = props.store;
  const floatingRootContext = store.state.floatingRootContext;

  const dismiss = useDismiss(floatingRootContext);

  const activeTriggerProps = () => dismiss.reference ?? {};
  const inactiveTriggerProps = () => dismiss.trigger ?? {};
  const popupProps = mergeProps(FOCUSABLE_POPUP_PROPS, dismiss.floating);

  createPopupInteractionProps(store, () => ({
    activeTriggerProps: activeTriggerProps(),
    inactiveTriggerProps: inactiveTriggerProps(),
    popupProps,
  }));

  return undefined as unknown as JSX.Element;
}

export interface PreviewCardRootState {}

export interface PreviewCardRootProps<Payload = unknown> {
  /**
   * Whether the preview card is initially open.
   *
   * To render a controlled preview card, use the `open` prop instead.
   * @default false
   */
  defaultOpen?: boolean | undefined;
  /**
   * Whether the preview card is currently open.
   */
  open?: boolean | undefined;
  /**
   * Event handler called when the preview card is opened or closed.
   */
  onOpenChange?:
    | ((open: boolean, eventDetails: PreviewCardRoot.ChangeEventDetails) => void)
    | undefined;
  /**
   * Event handler called after any animations complete when the preview card is opened or closed.
   */
  onOpenChangeComplete?: ((open: boolean) => void) | undefined;
  /**
   * A handle to associate the preview card with a trigger.
   * If specified, allows external triggers to control the card's open state.
   * Can be created with `PreviewCard.createHandle()`.
   */
  handle?: PreviewCardHandle<Payload> | undefined;
  /**
   * The content of the preview card.
   * This can be a regular Solid element or a render function that receives the `payload` of the
   * active trigger.
   */
  children?: JSX.Element | PreviewCardRoot.PayloadChildRenderFunction<Payload>;
  /**
   * ID of the trigger that the preview card is associated with.
   * This is useful in conjunction with the `open` prop to create a controlled preview card.
   * There's no need to specify this prop when the preview card is uncontrolled (that is, when the
   * `open` prop is not set).
   */
  triggerId?: string | null | undefined;
  /**
   * ID of the trigger that the preview card is associated with.
   * This is useful in conjunction with the `defaultOpen` prop to create an initially open preview
   * card.
   */
  defaultTriggerId?: string | null | undefined;
}

export type PreviewCardRootChangeEventReason =
  | typeof REASONS.triggerHover
  | typeof REASONS.triggerFocus
  | typeof REASONS.triggerPress
  | typeof REASONS.outsidePress
  | typeof REASONS.escapeKey
  | typeof REASONS.imperativeAction
  | typeof REASONS.none;

export type PreviewCardRootChangeEventDetails =
  BaseUIChangeEventDetails<PreviewCardRootChangeEventReason> & {
    preventUnmountOnClose(): void;
  };

export namespace PreviewCardRoot {
  export type State = PreviewCardRootState;
  export type Props<Payload = unknown> = PreviewCardRootProps<Payload>;
  export type ChangeEventReason = PreviewCardRootChangeEventReason;
  export type ChangeEventDetails = PreviewCardRootChangeEventDetails;
  export type PayloadChildRenderFunction<Payload> = (arg: {
    payload: Payload | undefined;
  }) => JSX.Element;
}
