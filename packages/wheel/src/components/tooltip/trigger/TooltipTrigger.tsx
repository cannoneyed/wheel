/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import { isElement } from '@floating-ui/utils/dom';
import { createTimeout } from '../../base-utils/createTimeout';
import { useTooltipRootContext } from '../root/TooltipRootContext';
import type { BaseUIComponentProps } from '../../internals/types';
import { triggerOpenStateMapping } from '../../utils/popupStateMapping';
import { renderElement } from '../../internals/renderElement';
import { createTriggerDataForwarding } from '../../utils/popups';
import { createBaseUiId } from '../../internals/createBaseUiId';
import { useTooltipProviderContext } from '../provider/TooltipProviderContext';
import {
  contains,
  safePolygon,
  useDelayGroup,
  useFocus,
  useHoverReferenceInteraction,
  isMouseLikePointerType,
} from '../../floating-ui-solid';
import { useHoverInteractionSharedState } from '../../floating-ui-solid/hooks/useHoverInteractionSharedState';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import { TooltipTriggerDataAttributes } from './TooltipTriggerDataAttributes';
import { OPEN_DELAY } from '../utils/constants';

const TOOLTIP_TRIGGER_IDENTIFIER = 'data-base-ui-tooltip-trigger';

function getTargetElement(event: Event): Element | null {
  if ('composedPath' in event) {
    const path = event.composedPath();
    for (let i = 0; i < path.length; i += 1) {
      const element = path[i];
      if (isElement(element)) {
        return element as Element;
      }
    }
  }

  const target = (event as any).target;
  if (isElement(target)) {
    return target as Element;
  }

  return null;
}

function closestEnabledTooltipTrigger(element: Element | null): Element | null {
  let current = element;
  while (current) {
    if (current.hasAttribute(TOOLTIP_TRIGGER_IDENTIFIER)) {
      return current;
    }

    const parentElement = current.parentElement;
    if (parentElement) {
      current = parentElement;
      continue;
    }

    const root = current.getRootNode();
    current = 'host' in root && isElement((root as ShadowRoot).host) ? (root as ShadowRoot).host : null;
  }

  return null;
}

/**
 * An element to attach the tooltip to.
 * Renders a `<button>` element.
 *
 * Documentation: [Base UI Tooltip](https://base-ui.com/react/components/tooltip)
 *
 * Deviation: upstream also accepts a `handle` prop for detached triggers (see the `handle`
 * deviation note on `createPopupRootStore`) — not ported. `payload` is kept: it's cheap plumbing
 * through the same trigger-data-forwarding path as `closeOnClick`/`closeDelay`.
 */
export function TooltipTrigger<Payload = unknown>(
  componentProps: TooltipTrigger.Props<Payload>,
): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'payload',
    'disabled',
    'delay',
    'closeOnClick',
    'closeDelay',
    'id',
  ]);

  const store = useTooltipRootContext();

  const thisTriggerId = createBaseUiId(() => local.id);
  const isOpenedByThisTrigger = store.useState('isOpenedByTrigger', thisTriggerId);
  const isTriggerActive = store.useState('isTriggerActive', thisTriggerId);
  const floatingRootContext = store.state.floatingRootContext;

  const triggerElementRef: { current: Element | null } = { current: null };

  const delayWithDefault = () => local.delay ?? OPEN_DELAY;
  const closeOnClick = () => local.closeOnClick ?? true;
  const closeDelayWithDefault = () => local.closeDelay ?? 0;

  const { registerTrigger, isMountedByThisTrigger } = createTriggerDataForwarding(
    thisTriggerId,
    triggerElementRef,
    store,
    () => ({
      payload: local.payload,
      closeOnClick: closeOnClick(),
      closeDelay: closeDelayWithDefault(),
    }),
  );

  const providerContext = useTooltipProviderContext();
  const { delayRef, isInstantPhase, hasProvider } = useDelayGroup(floatingRootContext, {
    open: isOpenedByThisTrigger,
  });
  const hoverInteraction = useHoverInteractionSharedState(floatingRootContext);

  store.syncValue('isInstantPhase', isInstantPhase);

  const rootDisabled = store.useState('disabled');
  const disabled = () => local.disabled ?? rootDisabled();
  const trackCursorAxis = store.useState('trackCursorAxis');
  const disableHoverablePopup = store.useState('disableHoverablePopup');
  const open = store.useState('open');
  const lastOpenChangeReason = store.useState('lastOpenChangeReason');
  const transitionStatus = store.useState('transitionStatus');

  let isNestedTriggerHovered = false;
  const nestedTriggerOpenTimeout = createTimeout();
  // Local copy so it can be cleared on mouseLeave without resetting the hover hook's own pointerType.
  let pointerType: string | undefined;

  function getOpenDelay() {
    const providerDelay = providerContext?.delay;
    const groupOpenValue = typeof delayRef.current === 'object' ? delayRef.current.open : undefined;

    let computedOpenDelay = delayWithDefault();
    if (hasProvider) {
      if (groupOpenValue !== 0) {
        computedOpenDelay = local.delay ?? providerDelay ?? delayWithDefault();
      } else {
        computedOpenDelay = 0;
      }
    }

    return computedOpenDelay;
  }

  function isEnabledNestedTriggerTarget(target: Element | null) {
    const triggerEl = triggerElementRef.current;
    if (!triggerEl || !target) {
      return false;
    }

    const nearestTrigger = closestEnabledTooltipTrigger(target);
    return (
      nearestTrigger !== null && nearestTrigger !== triggerEl && contains(triggerEl, nearestTrigger)
    );
  }

  function detectNestedTriggerHover(target: Element | null) {
    const nestedTriggerHovered = isEnabledNestedTriggerTarget(target);

    isNestedTriggerHovered = nestedTriggerHovered;
    if (nestedTriggerHovered) {
      hoverInteraction.openChangeTimeout.clear();
      hoverInteraction.restTimeout.clear();
      hoverInteraction.restTimeoutPending = false;
      nestedTriggerOpenTimeout.clear();
    }
    return nestedTriggerHovered;
  }

  const hoverProps = useHoverReferenceInteraction(floatingRootContext, {
    enabled: () => !disabled(),
    mouseOnly: () => true,
    move: () => false,
    handleClose:
      !disableHoverablePopup() && trackCursorAxis() !== 'both' ? safePolygon() : null,
    restMs: getOpenDelay,
    delay() {
      const closeValue = typeof delayRef.current === 'object' ? delayRef.current.close : undefined;

      let computedCloseDelay: number | undefined = closeDelayWithDefault();
      if (local.closeDelay == null && hasProvider) {
        computedCloseDelay = closeValue;
      }

      return {
        close: computedCloseDelay,
      };
    },
    triggerElementRef,
    isActiveTrigger: isTriggerActive,
    isClosing: () => transitionStatus() === 'ending',
    shouldOpen() {
      return !isNestedTriggerHovered;
    },
  });

  const focusProps = useFocus(floatingRootContext, { enabled: () => !disabled() }).reference;

  function handleNestedTriggerHover(event: MouseEvent) {
    const wasNestedTriggerHovered = isNestedTriggerHovered;
    const target = getTargetElement(event);
    const nestedTriggerHovered = detectNestedTriggerHover(target);
    const triggerEl = triggerElementRef.current as HTMLElement | null;
    const targetInsideTrigger = triggerEl && target && contains(triggerEl, target);

    // Only close hover-opened parents. Focus/click-like opens remain owned by
    // their original interaction and should not be clobbered by nested hover.
    if (
      nestedTriggerHovered &&
      open() &&
      lastOpenChangeReason() === REASONS.triggerHover
    ) {
      store.setOpen(false, createChangeEventDetails(REASONS.triggerHover, event));
      return;
    }

    if (
      wasNestedTriggerHovered &&
      !nestedTriggerHovered &&
      targetInsideTrigger &&
      !disabled() &&
      !open() &&
      triggerEl &&
      // Match the hover hook's non-strict mouse fallback for mouse-only event sequences.
      isMouseLikePointerType(pointerType)
    ) {
      const openNow = () => {
        if (!isNestedTriggerHovered && !disabled() && !open()) {
          store.setOpen(true, createChangeEventDetails(REASONS.triggerHover, event, triggerEl));
        }
      };

      const openDelay = getOpenDelay();

      // With `move: false`, the hover hook only listens to mouseenter/mouseleave
      // on the parent trigger. Leaving a nested child for the parent area fires
      // no event the hook can react to, so reopen locally.
      if (openDelay === 0) {
        nestedTriggerOpenTimeout.clear();
        openNow();
      } else {
        nestedTriggerOpenTimeout.start(openDelay, openNow);
      }
    }
  }

  const shouldApplyRootTriggerProps = () => isMountedByThisTrigger() || trackCursorAxis() !== 'none';
  const rootTriggerProps = store.useState('triggerProps', isMountedByThisTrigger);

  const state: TooltipTrigger.State = {
    get open() {
      return isOpenedByThisTrigger();
    },
  };

  return renderElement('button', componentProps, {
    defaultClass: 'wheel-Tooltip-Trigger',
    slot: 'tooltip-trigger',
    state,
    ref: [
      registerTrigger,
      (el: Element | null) => {
        triggerElementRef.current = el;
      },
    ],
    props: [
      hoverProps,
      () => focusProps ?? {},
      () => (shouldApplyRootTriggerProps() ? rootTriggerProps() : {}),
      // This zero-arg thunk is `renderElement`'s reactive-props convention (see CONVENTIONS.md);
      // the lint rule doesn't special-case that custom API and flags the object literal itself.
      () => ({
        onMouseOver(event: MouseEvent) {
          handleNestedTriggerHover(event);
        },
        onFocus(event: FocusEvent) {
          if (isEnabledNestedTriggerTarget(getTargetElement(event))) {
            // No Solid equivalent of `preventBaseUIHandler` is needed here: unlike upstream,
            // nothing else in this port attaches a competing `onFocus` handler to the same
            // element that would need suppressing.
          }
        },
        onMouseLeave() {
          isNestedTriggerHovered = false;
          nestedTriggerOpenTimeout.clear();
          pointerType = undefined;
        },
        onPointerEnter(event: PointerEvent) {
          pointerType = event.pointerType;
        },
        onPointerDown(event: PointerEvent) {
          pointerType = event.pointerType;
          store.set('closeOnClick', closeOnClick());
          if (closeOnClick() && !open()) {
            store.cancelPendingOpen(event);
          }
        },
        onClick(event: MouseEvent) {
          if (closeOnClick() && !open()) {
            store.cancelPendingOpen(event);
          }
        },
        id: thisTriggerId(),
        [TooltipTriggerDataAttributes.triggerDisabled]: disabled() ? '' : undefined,
        [TOOLTIP_TRIGGER_IDENTIFIER]: disabled() ? undefined : '',
      }),
      elementProps,
    ],
    stateAttributesMapping: triggerOpenStateMapping,
  });
}

export interface TooltipTriggerState {
  /**
   * Whether the tooltip is currently open and was opened by this trigger.
   */
  open: boolean;
}

export interface TooltipTriggerProps<Payload = unknown>
  extends BaseUIComponentProps<'button', TooltipTriggerState> {
  /**
   * A payload to pass to the tooltip when it is opened.
   */
  payload?: Payload | undefined;
  /**
   * How long to wait before opening the tooltip on hover. Specified in milliseconds.
   * @default 600
   */
  delay?: number | undefined;
  /**
   * Whether the tooltip should close when this trigger is clicked.
   * @default true
   */
  closeOnClick?: boolean | undefined;
  /**
   * How long to wait before closing the tooltip. Specified in milliseconds.
   * @default 0
   */
  closeDelay?: number | undefined;
  /**
   * If `true`, the tooltip will not open when interacting with this trigger.
   * Note that this doesn't apply the `disabled` attribute to the trigger element.
   * If you want to disable the trigger element itself, you can pass the `disabled` prop to the
   * trigger element via the `as`/`asChild` API.
   * @default false
   */
  disabled?: boolean | undefined;
}

export namespace TooltipTrigger {
  export type State = TooltipTriggerState;
  export type Props<Payload = unknown> = TooltipTriggerProps<Payload>;
}
