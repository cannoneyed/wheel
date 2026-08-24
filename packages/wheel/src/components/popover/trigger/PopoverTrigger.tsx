/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-view-root -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
import { onCleanup, Show, splitProps, type JSX } from 'solid-js';
import { usePopoverRootContext } from '../root/PopoverRootContext';
import type { BaseUIComponentProps, NativeButtonProps } from '../../internals/types';
import { renderElement } from '../../internals/renderElement';
import { createBaseUiId } from '../../internals/createBaseUiId';
import { createButton } from '../../internals/use-button/createButton';
import { CLICK_TRIGGER_IDENTIFIER } from '../../internals/constants';
import { REASONS } from '../../internals/reasons';
import {
  safePolygon,
  useClick,
  useHoverReferenceInteraction,
} from '../../floating-ui-solid';
import {
  triggerOpenStateMapping,
  pressableTriggerOpenStateMapping,
} from '../../utils/popupStateMapping';
import type { StateAttributesMapping } from '../../internals/getStateAttributesProps';
import { createTriggerDataForwarding, createTriggerFocusGuards } from '../../utils/popups';
import { createOpenMethodTriggerProps } from '../../utils/useOpenInteractionType';
import { FocusGuard } from '../../utils/FocusGuard';
import { OPEN_DELAY } from '../utils/constants';

/**
 * A button that opens the popover.
 * Renders a `<button>` element.
 *
 * Documentation: [Base UI Popover](https://base-ui.com/react/components/popover)
 *
 * Deviation: upstream also accepts a `handle` prop for detached triggers (see the `handle`
 * deviation note on `PopoverRoot`) — not ported.
 */
export function PopoverTrigger<Payload = unknown>(
  componentProps: PopoverTrigger.Props<Payload>,
): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'disabled',
    'nativeButton',
    'payload',
    'openOnHover',
    'delay',
    'closeDelay',
    'id',
  ]);

  const store = usePopoverRootContext();

  const disabled = () => local.disabled ?? false;
  const nativeButton = () => local.nativeButton ?? true;
  const openOnHover = () => local.openOnHover ?? false;
  const delay = () => local.delay ?? OPEN_DELAY;
  const closeDelay = () => local.closeDelay ?? 0;

  const thisTriggerId = createBaseUiId(() => local.id);
  const isTriggerActive = store.useState('isTriggerActive', thisTriggerId);
  const floatingRootContext = store.state.floatingRootContext;
  const isOpenedByThisTrigger = store.useState('isOpenedByTrigger', thisTriggerId);
  const popupId = store.useState('triggerPopupId', thisTriggerId);

  const triggerElementRef: { current: Element | null } = { current: null };

  const { registerTrigger, isMountedByThisTrigger } = createTriggerDataForwarding(
    thisTriggerId,
    triggerElementRef,
    store,
    () => ({
      payload: local.payload,
      disabled: disabled(),
      openOnHover: openOnHover(),
      closeDelay: closeDelay(),
    }),
  );

  const stickIfOpen = store.useState('stickIfOpen');
  const openChangeReason = store.useState('openChangeReason');
  const openMethod = store.useState('openMethod');
  const focusManagerModal = store.useState('focusManagerModal');
  const transitionStatus = store.useState('transitionStatus');

  const hoverProps = useHoverReferenceInteraction(floatingRootContext, {
    enabled: () =>
      !disabled() &&
      openOnHover() &&
      (openMethod() !== 'touch' || openChangeReason() !== REASONS.triggerPress),
    mouseOnly: () => true,
    move: () => false,
    handleClose: safePolygon(),
    restMs: delay,
    delay: () => ({ close: closeDelay() }),
    triggerElementRef,
    isActiveTrigger: isTriggerActive,
    isClosing: () => transitionStatus() === 'ending',
  });

  const click = useClick(floatingRootContext, { stickIfOpen });
  const interactionTypeProps = createOpenMethodTriggerProps(store.useState('open'), (interactionType) => {
    store.set('openMethod', interactionType);
  });

  const rootTriggerProps = store.useState('triggerProps', isMountedByThisTrigger);

  const { getButtonProps, buttonRef } = createButton({ disabled, native: nativeButton });

  const stateAttributesMapping: StateAttributesMapping<{ open: boolean }> = {
    open(value) {
      if (value && openChangeReason() === REASONS.triggerPress) {
        return pressableTriggerOpenStateMapping.open(value);
      }

      return triggerOpenStateMapping.open(value);
    },
  };

  const { setPreFocusGuardRef, handlePreFocusGuardFocus, handleFocusTargetFocus } =
    createTriggerFocusGuards(store, triggerElementRef);

  const state: PopoverTrigger.State = {
    get disabled() {
      return disabled();
    },
    get open() {
      return isOpenedByThisTrigger();
    },
  };

  const element = renderElement('button', componentProps, {
    defaultClass: 'wheel-Popover-Trigger',
    slot: 'popover-trigger',
    state,
    ref: [
      buttonRef,
      registerTrigger,
      (el: Element | null) => {
        triggerElementRef.current = el;
      },
    ],
    props: [
      click.reference,
      hoverProps,
      rootTriggerProps,
      interactionTypeProps,
      () => ({
        id: thisTriggerId(),
        [CLICK_TRIGGER_IDENTIFIER]: '',
        'aria-haspopup': 'dialog' as const,
        'aria-expanded': isOpenedByThisTrigger(),
        'aria-controls': popupId(),
      }),
      elementProps,
      getButtonProps,
    ],
    stateAttributesMapping,
  });

  const shouldRenderFocusGuards = () => isMountedByThisTrigger() && !focusManagerModal();

  // `element` is a single stable DOM node created once above and rendered directly (never inside
  // a `<Show>` branch of its own), so toggling the focus guards on and off never removes/reinserts
  // the trigger itself — only the sibling guard spans are mounted/unmounted around it. This is the
  // Solid equivalent of upstream's keyed fragment (which keeps React from remounting the trigger
  // when the surrounding guards appear/disappear).
  //
  // The outer `display: contents` wrapper is load-bearing, not decorative: when this component's
  // *own top-level return* is a bare fragment of [`<Show>`, `element`, `<Show>`], toggling either
  // `<Show>` synchronously during the same click that opens the popover (`isMountedByThisTrigger`
  // flips true mid-event) causes Solid to tear down and rebuild that whole sibling group — even
  // though `element` itself is never inside a conditional branch — which blurs a focused `element`
  // to `document.body` (verified with a minimal repro: an equivalent bare-fragment case reproduces
  // the blur every time; wrapping the group in one extra intermediate element, with no other
  // change, reliably avoids it). `display: contents` keeps that wrapper invisible to layout/a11y
  // (it never becomes an accessibility-tree node or a flex/grid box) while still giving Solid a
  // stable parent to key the reconciliation off of. Since the guards remain direct DOM siblings of
  // `element` *within* this wrapper, `element.previousElementSibling`/`nextElementSibling` still
  // resolve to the guards exactly as upstream's sibling-based tests expect.
  return (
    <div style={{ display: 'contents' }}>
      <Show when={shouldRenderFocusGuards()}>
        <FocusGuard ref={setPreFocusGuardRef} onFocus={handlePreFocusGuardFocus} />
      </Show>
      {element}
      <Show when={shouldRenderFocusGuards()}>
        <FocusGuard
          ref={(el) => {
            store.context.triggerFocusTargetRef.current = el;
            // Upstream relies on React nulling `triggerFocusTargetRef.current` when this guard
            // unmounts (e.g. when `Popover.Trigger`'s own `handleFocusTargetFocus` closes the
            // popover from inside this guard's own `onFocus`), so its `.current ||
            // triggerElementRef.current` fallback picks up the still-mounted trigger button
            // instead of a stale reference. Solid's ref callback never re-fires with `null` on
            // unmount, so without this explicit reset `.current` would keep pointing at this now
            // *detached* guard node — `getTabbableAfterElement` on a disconnected node has no
            // siblings to walk and returns nothing, silently breaking the tab-forward-out-of-popup
            // handoff. `onCleanup` runs synchronously when this `<Show>` branch unmounts, so the
            // reset lands before any code reads `.current` afterward.
            onCleanup(() => {
              if (store.context.triggerFocusTargetRef.current === el) {
                store.context.triggerFocusTargetRef.current = null;
              }
            });
          }}
          onFocus={handleFocusTargetFocus}
        />
      </Show>
    </div>
  );
}

export interface PopoverTriggerState {
  /**
   * Whether the trigger is currently disabled.
   */
  disabled: boolean;
  /**
   * Whether the popover is currently open and was opened by this trigger.
   */
  open: boolean;
}

export interface PopoverTriggerProps<Payload = unknown>
  extends NativeButtonProps,
    BaseUIComponentProps<'button', PopoverTriggerState> {
  /**
   * A payload to pass to the popover when it is opened.
   */
  payload?: Payload | undefined;
  /**
   * Whether the component should ignore user interaction.
   * @default false
   */
  disabled?: boolean | undefined;
  /**
   * ID of the trigger. In addition to being forwarded to the rendered element, it is also used to
   * specify the active trigger for the popover in controlled mode (with the `Popover.Root`
   * `triggerId` prop).
   */
  id?: string | undefined;
  /**
   * Whether the popover should also open when the trigger is hovered.
   * @default false
   */
  openOnHover?: boolean | undefined;
  /**
   * How long to wait before the popover may be opened on hover. Specified in milliseconds.
   *
   * Requires the `openOnHover` prop.
   * @default 300
   */
  delay?: number | undefined;
  /**
   * How long to wait before closing the popover that was opened on hover. Specified in
   * milliseconds.
   *
   * Requires the `openOnHover` prop.
   * @default 0
   */
  closeDelay?: number | undefined;
}

export namespace PopoverTrigger {
  export type State = PopoverTriggerState;
  export type Props<Payload = unknown> = PopoverTriggerProps<Payload>;
}
