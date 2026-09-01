/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { useSignal } from '../../../core/local-state';
import {
  createEffect,
  onCleanup,
  splitProps,
  untrack,
  type Accessor,
  type JSX,
} from 'solid-js';
import { usePreviewCardRootContext } from '../root/PreviewCardContext';
import type { BaseUIComponentProps, HTMLProps } from '../../internals/types';
import { triggerOpenStateMapping } from '../../utils/popupStateMapping';
import { renderElement } from '../../internals/renderElement';
import { createBaseUiId } from '../../internals/createBaseUiId';
import {
  createTriggerDataForwarding,
  usePopupHandleStore,
  type PopupRootStore,
} from '../../utils/popups';
import type { PreviewCardHandle } from '../store/PreviewCardHandle';
import {
  type PreviewCardHandleStore,
  type PreviewCardStore,
  type State as PreviewCardStoreState,
} from '../store/PreviewCardStore';
import {
  safePolygon,
  useFocus,
  useHoverReferenceInteraction,
  type ElementProps,
} from '../../floating-ui-solid';
import { OPEN_DELAY, CLOSE_DELAY } from '../utils/constants';

/**
 * A link that opens the preview card.
 * Renders an `<a>` element.
 *
 * Documentation: [Base UI Preview Card](https://base-ui.com/react/components/preview-card)
 *
 * Deviation: this port additionally supports upstream's `handle` prop (detached triggers), which
 * the Tooltip/Popover ports in this repo explicitly cut. The resolved store (`handle`'s exposed
 * store, or the `<PreviewCard.Root>` ancestor's) is re-resolved reactively — not read once at
 * setup like `TooltipTrigger`/`PopoverTrigger` — inside a single `createEffect` that (re)registers
 * this trigger's DOM element and (re)binds its hover/focus interactions whenever the resolved
 * store's identity changes. This is necessary, not just defensive: a detached trigger commonly
 * mounts *before* the `handle`'s root has attached (`usePopupHandleStore` initially exposes the
 * handle's inert fallback store), and the attach itself happens in the root's own `createEffect` —
 * deferred exactly like this one. Reading the store once at setup would permanently bind this
 * trigger's registration and hover/focus listeners to the (inert) fallback, since Solid components
 * run their body exactly once; wrapping the binding in an effect keyed on the resolved store lets
 * it tear down and rebuild once the attach effect fires (including across later detach/reattach).
 * `PreviewCardRoot`'s handle-attachment effect is the counterpart on the other side of this
 * store-pointer handshake.
 *
 * The registration call itself (`registerTrigger(...)`) is wrapped in `untrack()`: it synchronously
 * reads *and* writes plain store fields (`triggerElements`/`triggerCount`, via the shared
 * `createTriggerRegistration` helper in `utils/popups/popupStoreUtils.ts`). That helper is normally
 * invoked from a DOM `ref` callback (as `TooltipTrigger`/`PopoverTrigger` do), a non-tracking
 * context — invoking it from inside a running `createEffect` without `untrack` makes its own
 * `triggerCount` read a dependency of this effect, and the write a few lines later to that same key
 * then re-triggers this same effect, forever (verified empirically: removing the `untrack` here
 * reproduces a real, infinite `runUpdates`/`completeUpdates` cascade in Solid's scheduler). No other
 * ported component calls this helper from inside an effect, so this mismatch wasn't observable
 * before; flagged here rather than fixed in the shared helper itself.
 */
export function PreviewCardTrigger<Payload = unknown>(
  componentProps: PreviewCardTrigger.Props<Payload>,
): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'handle',
    'payload',
    'delay',
    'closeDelay',
    'id',
  ]);

  const rootContext = usePreviewCardRootContext(true);
  const handleStore = usePopupHandleStore<PreviewCardHandleStore<unknown>>(() => local.handle);

  // Kept as `unknown` (not `Payload`) throughout, matching `TooltipTrigger`'s equivalent context
  // read: `Payload` only needs to flow one-way, from this trigger's own `payload` prop into the
  // store's `payload` state slot (always assignable into `unknown`), never back out with its
  // specific type — the popup reads `payload` from `PreviewCard.Root`'s context, not this store.
  function resolveStore(): PreviewCardHandleStore<unknown> | PreviewCardStore<unknown> {
    const fromHandle = handleStore();
    if (fromHandle !== undefined) {
      return fromHandle;
    }
    if (rootContext !== undefined) {
      return rootContext;
    }
    throw new Error(
      'Base UI: <PreviewCard.Trigger> must be either used within a <PreviewCard.Root> component or provided with a handle.',
    );
  }

  const thisTriggerId = createBaseUiId(() => local.id);
  const triggerElementRef: { current: Element | null } = { current: null };

  const delayWithDefault = () => local.delay ?? OPEN_DELAY;
  const closeDelayWithDefault = () => local.closeDelay ?? CLOSE_DELAY;

  const [hoverProps, setHoverProps] = useSignal<Accessor<HTMLProps<Element> | undefined>>(
    () => undefined, 'hoverProps');
  const [focusProps, setFocusProps] = useSignal<ElementProps['reference']>({}, 'focusProps');
  const [isMountedByThisTrigger, setIsMountedByThisTrigger] = useSignal<Accessor<boolean>>(
    () => false, 'isMountedByThisTrigger');

  // (Re)binds registration and hover/focus interactions whenever the resolved store's identity
  // changes. See this file's doc comment for why a one-time setup (as in `TooltipTrigger`/
  // `PopoverTrigger`) isn't sufficient here.
  createEffect(() => {
    const store = resolveStore();

    const { registerTrigger, isMountedByThisTrigger: mountedByThisTrigger } =
      createTriggerDataForwarding(
        thisTriggerId,
        triggerElementRef,
        // `store`'s narrowed handle-store type intentionally omits `setOpen`/`syncValue` (see
        // `PreviewCardHandleStore`'s doc comment) — neither is called by
        // `createTriggerDataForwarding`, only by imperative open/close paths this trigger never
        // exercises directly. Reported as a shared-infra type gap rather than fixed in place.
        store as unknown as PopupRootStore<PreviewCardStoreState<unknown>>,
        () => ({ payload: local.payload, closeDelay: closeDelayWithDefault() }),
      );
    setIsMountedByThisTrigger(() => mountedByThisTrigger);

    // See this file's doc comment: `registerTrigger`/its `onCleanup` counterpart synchronously
    // read and write plain store fields meant to be read from a non-tracking context (a DOM ref
    // callback upstream); `untrack` keeps those reads/writes from becoming a dependency of (and
    // thereby infinitely re-triggering) this effect.
    untrack(() => {
      if (triggerElementRef.current) {
        registerTrigger(triggerElementRef.current);
      }
    });
    onCleanup(() => untrack(() => registerTrigger(null)));

    const floatingRootContext = store.useState('floatingRootContext')();

    const hover = useHoverReferenceInteraction(floatingRootContext, {
      mouseOnly: () => true,
      move: () => false,
      handleClose: safePolygon(),
      delay: () => ({ open: delayWithDefault(), close: closeDelayWithDefault() }),
      triggerElementRef,
      isActiveTrigger: () => store.useState('isTriggerActive', thisTriggerId())(),
      isClosing: () => store.useState('transitionStatus')() === 'ending',
    });
    setHoverProps(() => hover);

    const focus = useFocus(floatingRootContext, { delay: delayWithDefault }).reference;
    setFocusProps(focus ?? {});
  });

  const isOpenedByThisTrigger = () =>
    resolveStore().useState('isOpenedByTrigger', thisTriggerId())();
  const rootTriggerProps = () =>
    resolveStore().useState('triggerProps', isMountedByThisTrigger())() ?? {};

  const state: PreviewCardTrigger.State = {
    get open() {
      return isOpenedByThisTrigger();
    },
  };

  return renderElement('a', componentProps, {
    defaultClass: 'wheel-PreviewCard-Trigger',
    slot: 'preview-card-trigger',
    state,
    ref: (el: Element | null) => {
      triggerElementRef.current = el;
    },
    props: [
      // This zero-arg thunk is `renderElement`'s reactive-props convention (see CONVENTIONS.md);
      // the lint rule doesn't special-case that custom API and flags the reactive reads inside it.
      () => hoverProps()() ?? {},
      () => focusProps() ?? {},
      rootTriggerProps,
      () => ({ id: thisTriggerId() }),
      elementProps,
    ],
    stateAttributesMapping: triggerOpenStateMapping,
  });
}

export interface PreviewCardTriggerState {
  /**
   * Whether the preview card is currently open and was opened by this trigger.
   */
  open: boolean;
}

export interface PreviewCardTriggerProps<Payload = unknown>
  extends BaseUIComponentProps<'a', PreviewCardTriggerState> {
  /**
   * A handle to associate the trigger with a preview card.
   */
  handle?: PreviewCardHandle<Payload> | undefined;
  /**
   * A payload to pass to the preview card when it is opened.
   */
  payload?: Payload | undefined;
  /**
   * How long to wait before the preview card opens. Specified in milliseconds.
   * @default 600
   */
  delay?: number | undefined;
  /**
   * How long to wait before closing the preview card. Specified in milliseconds.
   * @default 300
   */
  closeDelay?: number | undefined;
}

export namespace PreviewCardTrigger {
  export type State = PreviewCardTriggerState;
  export type Props<Payload = unknown> = PreviewCardTriggerProps<Payload>;
}
