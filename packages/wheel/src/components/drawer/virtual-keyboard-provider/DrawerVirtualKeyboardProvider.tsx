/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createEffect, onCleanup, type JSX } from 'solid-js';
import { getComputedStyle, getParentNode, isHTMLElement } from '@floating-ui/utils/dom';
import { addEventListener } from '../../base-utils/addEventListener';
import { ownerDocument, ownerWindow } from '../../base-utils/owner';
import { createAnimationFrame } from '../../base-utils/createAnimationFrame';
import { useDrawerRootContext } from '../root/DrawerRootContext';
import { clamp } from '../../internals/clamp';
import { activeElement, contains, getTarget, isInteractiveElement } from '../../floating-ui-solid/utils/element';
import { findScrollableTouchTarget } from '../utils/scrollable';
import { getElementAtPoint } from '../utils/getElementAtPoint';
import { DrawerViewportCssVars } from '../viewport/DrawerViewportCssVars';
import { DrawerVirtualKeyboardContext } from './DrawerVirtualKeyboardContext';

const KEYBOARD_RESIZE_THRESHOLD = 60;
const KEYBOARD_VISIBILITY_MARGIN = 16;
// Extra breathing room (px) added below the focused field, on top of its measured
// keyboard overlap, so the field can be scrolled clear of the keyboard instead of
// ending up flush against it. Only applied when there is actual overlap.
const KEYBOARD_SCROLL_SLACK = 48;
const INPUT_TAP_MOVE_THRESHOLD = 10;
const INPUT_TAP_HIT_SLOP = 16;
const KEYBOARD_INPUT_TYPES = new Set(['email', 'number', 'password', 'search', 'tel', 'text', 'url']);

// Snapshot of a scroll container's relevant styles taken before keyboard slack is
// applied. The string fields are the exact inline values to restore on cleanup;
// the parsed numbers are the computed baselines that slack is added on top of.
interface ScrollAdjustment {
  readonly element: HTMLElement;
  readonly overflowAnchor: string;
  readonly paddingBottom: string;
  readonly scrollPaddingBottom: string;
  readonly computedPaddingBottom: number;
  readonly computedScrollPaddingBottom: number;
}

interface KeyboardVisualViewport {
  readonly top: number;
  readonly bottom: number;
}

interface KeyboardTouchTarget {
  readonly focusTarget: HTMLElement;
  readonly clickTarget: HTMLElement;
}

// Returned by the point-based resolver when the lift point lands on another
// interactive/label element. It signals that the tap was intentionally rejected, so the
// caller must NOT fall back to the touchstart target (`touchend.target` stays at the
// touchstart node on mobile) — doing so would steal a tap meant for that element.
const KEYBOARD_TAP_BLOCKED = Symbol('KeyboardTapBlocked');

/**
 * Provides keyboard-aware focus and scroll handling for bottom-sheet drawers with form fields.
 * Solid port of upstream's `DrawerVirtualKeyboardProvider`.
 *
 * Documentation: [Base UI Drawer](https://base-ui.com/react/components/drawer)
 */
export function DrawerVirtualKeyboardProvider(
  props: DrawerVirtualKeyboardProvider.Props,
): JSX.Element {
  const store = useDrawerRootContext();

  const open = store.useState('open');
  const mounted = store.useState('mounted');
  const nestedOpenDialogCount = store.useState('nestedOpenDialogCount');
  const viewportElement = store.useState('viewportElement');

  // The provider requires a `<Drawer.Viewport>` to act as the measurement and containment
  // root and to host the keyboard inset variable; `<Drawer.Popup>` already warns when the
  // viewport is missing, so there is no need to fall back to the popup element here.
  const rootElement = viewportElement;
  const nestedDrawerOpen = () => nestedOpenDialogCount() > 0;

  let pendingKeyboardFocusMoved = false;
  let keyboardTouchStart: { x: number; y: number } | null = null;
  let focusedKeyboardTarget: HTMLElement | null = null;
  let keyboardScrollAdjustment: ScrollAdjustment | null = null;
  const keyboardFocusFrame = createAnimationFrame();

  function restoreKeyboardScrollAdjustment() {
    const adjustment = keyboardScrollAdjustment;
    if (!adjustment) {
      return;
    }
    adjustment.element.style.overflowAnchor = adjustment.overflowAnchor;
    adjustment.element.style.paddingBottom = adjustment.paddingBottom;
    adjustment.element.style.scrollPaddingBottom = adjustment.scrollPaddingBottom;
    keyboardScrollAdjustment = null;
  }

  function setKeyboardScrollSlack(element: HTMLElement, slack: number) {
    const roundedSlack = Math.max(0, Math.ceil(slack));
    let adjustment = keyboardScrollAdjustment;

    if (adjustment && !adjustment.element.isConnected) {
      restoreKeyboardScrollAdjustment();
      adjustment = null;
    }

    if (roundedSlack === 0) {
      restoreKeyboardScrollAdjustment();
      return;
    }

    if (adjustment && adjustment.element !== element) {
      restoreKeyboardScrollAdjustment();
      adjustment = null;
    }

    if (!adjustment) {
      const styles = getComputedStyle(element);
      adjustment = {
        element,
        overflowAnchor: element.style.overflowAnchor,
        paddingBottom: element.style.paddingBottom,
        scrollPaddingBottom: element.style.scrollPaddingBottom,
        computedPaddingBottom: Number.parseFloat(styles.paddingBottom) || 0,
        computedScrollPaddingBottom: Number.parseFloat(styles.scrollPaddingBottom) || 0,
      };
      keyboardScrollAdjustment = adjustment;
    }

    element.style.overflowAnchor = 'none';
    element.style.paddingBottom = `${adjustment.computedPaddingBottom + roundedSlack}px`;
    element.style.scrollPaddingBottom = `${
      adjustment.computedScrollPaddingBottom + KEYBOARD_VISIBILITY_MARGIN
    }px`;
  }

  function animateKeyboardScroll(element: HTMLElement, scrollTop: number) {
    const win = ownerWindow(element);
    const behavior: ScrollBehavior = win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
      ? 'auto'
      : 'smooth';

    element.scrollTo({ top: scrollTop, behavior });
  }

  function resetTouchTrackingState() {
    pendingKeyboardFocusMoved = false;
    keyboardTouchStart = null;
  }

  createEffect(() => {
    const isOpen = open();
    const isMounted = mounted();
    const isNestedDrawerOpen = nestedDrawerOpen();
    const element = rootElement();

    if (!isMounted || !isOpen) {
      focusedKeyboardTarget = null;
      restoreKeyboardScrollAdjustment();
      keyboardFocusFrame.cancel();
      return;
    }

    if (!element) {
      restoreKeyboardScrollAdjustment();
      return;
    }

    const doc = ownerDocument(element);
    const win = ownerWindow(element);
    const visualViewport = win.visualViewport;

    const setDrawerKeyboardInset = (inset: number) => {
      element.style.setProperty(
        DrawerViewportCssVars.keyboardInset,
        `${Math.max(0, Math.ceil(inset))}px`,
      );
    };

    const resetDrawerKeyboardInset = () => {
      setDrawerKeyboardInset(0);
    };

    const clearFocusedKeyboardTarget = () => {
      focusedKeyboardTarget = null;
      resetDrawerKeyboardInset();
      restoreKeyboardScrollAdjustment();
      keyboardFocusFrame.cancel();
    };

    const alignFocusedKeyboardTarget = () => {
      const target = focusedKeyboardTarget;
      // If the focused field is removed from the DOM without firing `focusout` (e.g. it is
      // conditionally rendered away), any applied scroll slack is restored here on the next
      // focus/viewport event or when the drawer closes. This self-corrects rather than
      // tracking each field's lifecycle.
      if (isNestedDrawerOpen || !target || !contains(element, target)) {
        resetDrawerKeyboardInset();
        restoreKeyboardScrollAdjustment();
        return;
      }

      const keyboardViewport = getKeyboardVisualViewport(win);
      if (!keyboardViewport) {
        resetDrawerKeyboardInset();
        restoreKeyboardScrollAdjustment();
        return;
      }

      setDrawerKeyboardInset(getDrawerKeyboardInset(win, keyboardViewport));

      const scrollTarget = findKeyboardScrollTarget(target, element);
      if (!scrollTarget) {
        restoreKeyboardScrollAdjustment();
        return;
      }

      if (!scrollTarget.isConnected || !contains(element, scrollTarget)) {
        resetDrawerKeyboardInset();
        restoreKeyboardScrollAdjustment();
        return;
      }

      const scrollTargetRect = scrollTarget.getBoundingClientRect();
      const clippedBottom = Math.min(scrollTargetRect.bottom, keyboardViewport.bottom);
      const overlap = Math.max(0, scrollTargetRect.bottom - keyboardViewport.bottom);
      setKeyboardScrollSlack(scrollTarget, overlap > 0 ? overlap + KEYBOARD_SCROLL_SLACK : 0);

      const maxScrollTop = Math.max(0, scrollTarget.scrollHeight - scrollTarget.clientHeight);
      if (maxScrollTop <= 0) {
        return;
      }

      const clippedTop = Math.max(scrollTargetRect.top, keyboardViewport.top);
      const visibleTop = clippedTop + KEYBOARD_VISIBILITY_MARGIN;
      const visibleBottom = clippedBottom - KEYBOARD_VISIBILITY_MARGIN;
      if (visibleBottom <= visibleTop) {
        return;
      }

      const targetRect = target.getBoundingClientRect();
      const targetCenter = (targetRect.top + targetRect.bottom) / 2;
      const visibleCenter = (visibleTop + visibleBottom) / 2;
      const nextScrollTop = scrollTarget.scrollTop + targetCenter - visibleCenter;

      animateKeyboardScroll(scrollTarget, clamp(nextScrollTop, 0, maxScrollTop));
    };

    const scheduleKeyboardFocusAlignment = () => {
      keyboardFocusFrame.request(alignFocusedKeyboardTarget);
    };

    const captureFocusedKeyboardTarget = (eventTarget: EventTarget | null) => {
      if (isNestedDrawerOpen) {
        return false;
      }

      // Resolve through the same path as taps so contentEditable hosts (and labelled
      // controls) are normalized identically for the focus and touch paths.
      const target = resolveKeyboardInputTarget(eventTarget);
      if (!target || !contains(element, target)) {
        return false;
      }

      focusedKeyboardTarget = target;
      return true;
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (captureFocusedKeyboardTarget(getTarget(event))) {
        scheduleKeyboardFocusAlignment();
      }
    };

    const handleFocusOut = (event: FocusEvent) => {
      if (captureFocusedKeyboardTarget(event.relatedTarget)) {
        scheduleKeyboardFocusAlignment();
        return;
      }

      clearFocusedKeyboardTarget();
    };

    const handleViewportUpdate = () => {
      if (focusedKeyboardTarget || captureFocusedKeyboardTarget(activeElement(doc))) {
        scheduleKeyboardFocusAlignment();
      }
    };

    const cleanupListeners: Array<() => void> = [];

    if (visualViewport) {
      cleanupListeners.push(
        addEventListener(visualViewport, 'resize', handleViewportUpdate),
        addEventListener(visualViewport, 'scroll', handleViewportUpdate),
      );
    }

    cleanupListeners.push(
      addEventListener(doc, 'focusin', handleFocusIn, true),
      addEventListener(doc, 'focusout', handleFocusOut, true),
    );

    if (captureFocusedKeyboardTarget(activeElement(doc))) {
      scheduleKeyboardFocusAlignment();
    }

    onCleanup(() => {
      cleanupListeners.forEach((cleanup) => cleanup());
      clearFocusedKeyboardTarget();
      element.style.removeProperty(DrawerViewportCssVars.keyboardInset);
    });
  });

  function onTouchStart(event: TouchEvent) {
    if (!open() || !mounted() || nestedDrawerOpen()) {
      resetTouchTrackingState();
      return;
    }

    const touch = event.touches[0];
    if (!touch) {
      return;
    }

    pendingKeyboardFocusMoved = false;
    keyboardTouchStart = { x: touch.clientX, y: touch.clientY };
  }

  function onTouchMove(event: TouchEvent) {
    const touch = event.touches[0];
    const touchStart = keyboardTouchStart;

    if (!touch || !touchStart || pendingKeyboardFocusMoved) {
      return;
    }

    // Treat the gesture as a scroll/swipe (not a tap-to-focus) once the finger
    // moves past the threshold, so we don't open the keyboard on a drag.
    if (
      Math.abs(touch.clientX - touchStart.x) > INPUT_TAP_MOVE_THRESHOLD ||
      Math.abs(touch.clientY - touchStart.y) > INPUT_TAP_MOVE_THRESHOLD
    ) {
      pendingKeyboardFocusMoved = true;
    }
  }

  function onTouchEnd(event: TouchEvent) {
    const element = rootElement();
    if (
      !open() ||
      !mounted() ||
      nestedDrawerOpen() ||
      !element ||
      !keyboardTouchStart ||
      pendingKeyboardFocusMoved
    ) {
      resetTouchTrackingState();
      return;
    }

    const touch = event.changedTouches[0] ?? event.touches[0];
    const doc = ownerDocument(event.currentTarget as Element | null);
    const nativeEventTarget = getTarget(event);
    const pointTarget = touch
      ? resolveKeyboardTouchTargetFromPoint(doc, touch.clientX, touch.clientY)
      : null;

    // The lift point landed on another interactive/label element; let its native tap
    // through instead of stealing it for the touchstart input.
    if (pointTarget === KEYBOARD_TAP_BLOCKED) {
      resetTouchTrackingState();
      return;
    }

    const keyboardTarget = touch && (pointTarget ?? resolveKeyboardTouchTarget(nativeEventTarget));

    if (
      keyboardTarget &&
      (!contains(element, keyboardTarget.focusTarget) || !contains(element, keyboardTarget.clickTarget))
    ) {
      resetTouchTrackingState();
      return;
    }

    if (keyboardTarget) {
      const { clickTarget: keyboardClickTarget, focusTarget: keyboardFocusTarget } = keyboardTarget;
      const win = ownerWindow(keyboardFocusTarget);

      // While pinch-zoomed, keyboard alignment is suspended; let native behavior
      // handle focus and caret placement instead of blurring and re-focusing.
      if (win.visualViewport && win.visualViewport.scale !== 1) {
        resetTouchTrackingState();
        return;
      }

      // Already focused with the keyboard up: let the native tap through so it can
      // reposition the caret, rather than blurring and re-focusing the same input.
      if (
        activeElement(ownerDocument(keyboardFocusTarget)) === keyboardFocusTarget &&
        isKeyboardVisualViewportOpen(win)
      ) {
        resetTouchTrackingState();
        return;
      }

      // iOS only opens the software keyboard when focus happens synchronously
      // inside the touch gesture.
      event.preventDefault();
      focusKeyboardInputWithoutPageScroll(keyboardFocusTarget);
      // Preventing the touchend default also suppresses the compatibility mouse
      // events, including `click`; redispatch an untrusted replacement on the
      // original tap target so click handlers still run with the tap coordinates.
      dispatchKeyboardClick(keyboardClickTarget, touch);
      resetTouchTrackingState();
      return;
    }

    resetTouchTrackingState();
  }

  const contextValue: DrawerVirtualKeyboardContext = {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel: resetTouchTrackingState,
  };

  return (
    <DrawerVirtualKeyboardContext.Provider value={contextValue}>
      {props.children}
    </DrawerVirtualKeyboardContext.Provider>
  );
}

export interface DrawerVirtualKeyboardProviderState {}

export interface DrawerVirtualKeyboardProviderProps {
  children?: JSX.Element;
}

export namespace DrawerVirtualKeyboardProvider {
  export type State = DrawerVirtualKeyboardProviderState;
  export type Props = DrawerVirtualKeyboardProviderProps;
}

function isKeyboardInputElement(element: HTMLElement): boolean {
  if (element.isContentEditable) {
    return true;
  }

  const win = ownerWindow(element);

  if (
    element instanceof win.HTMLTextAreaElement ||
    (element instanceof win.HTMLInputElement && KEYBOARD_INPUT_TYPES.has(element.type))
  ) {
    // Disabled controls can't focus or open the keyboard, so tap-to-focus must skip them —
    // otherwise the dispatched click fires handlers a native tap on a disabled control never would.
    return !element.matches(':disabled');
  }

  return false;
}

function resolveKeyboardInputTarget(target: EventTarget | null): HTMLElement | null {
  if (!isHTMLElement(target)) {
    return null;
  }

  if (isKeyboardInputElement(target)) {
    return target.isContentEditable ? getContentEditableHost(target) : target;
  }

  const label = target.closest('label') as HTMLLabelElement | null;
  const control = label?.control ?? null;

  return isHTMLElement(control) && isKeyboardInputElement(control) ? control : null;
}

function resolveKeyboardTouchTarget(target: EventTarget | null): KeyboardTouchTarget | null {
  const focusTarget = resolveKeyboardInputTarget(target);
  if (!focusTarget) {
    return null;
  }

  return {
    focusTarget,
    clickTarget: isHTMLElement(target) ? target : focusTarget,
  };
}

// Inherited-editable descendants (no `contenteditable` attribute of their own) are not
// focusable, so focusing them is a no-op; resolve taps on them to the editing host.
function getContentEditableHost(element: HTMLElement): HTMLElement {
  let host = element;
  while (host.parentElement?.isContentEditable) {
    host = host.parentElement;
  }
  return host;
}

function resolveKeyboardTouchTargetFromPoint(
  doc: Document,
  clientX: number,
  clientY: number,
): KeyboardTouchTarget | typeof KEYBOARD_TAP_BLOCKED | null {
  const exactTarget = getElementAtPoint(doc, clientX, clientY);
  const exactKeyboardTarget = resolveKeyboardInputTarget(exactTarget);
  if (exactKeyboardTarget) {
    return {
      focusTarget: exactKeyboardTarget,
      clickTarget: isHTMLElement(exactTarget) ? exactTarget : exactKeyboardTarget,
    };
  }

  // Probing nearby points compensates for iOS retargeting taps while the page reacts
  // to the keyboard, but it must not steal a tap that lands on another interactive
  // element — that would suppress its click and focus a neighboring field instead.
  if (isInteractiveElement(exactTarget) || exactTarget?.closest('label') != null) {
    return KEYBOARD_TAP_BLOCKED;
  }

  for (const [offsetX, offsetY] of [
    [0, INPUT_TAP_HIT_SLOP],
    [0, -INPUT_TAP_HIT_SLOP],
    [INPUT_TAP_HIT_SLOP, 0],
    [-INPUT_TAP_HIT_SLOP, 0],
  ]) {
    const keyboardTarget = resolveKeyboardInputTarget(
      getElementAtPoint(doc, clientX + offsetX, clientY + offsetY),
    );

    if (keyboardTarget) {
      return {
        focusTarget: keyboardTarget,
        clickTarget: keyboardTarget,
      };
    }
  }

  return null;
}

function dispatchKeyboardClick(target: HTMLElement, touch: Pick<Touch, 'clientX' | 'clientY'>) {
  const win = ownerWindow(target);
  const ClickEvent = win.PointerEvent ?? win.MouseEvent;

  target.dispatchEvent(
    new ClickEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: touch.clientX,
      clientY: touch.clientY,
      detail: 1,
      view: win,
    }),
  );
}

function focusKeyboardInputWithoutPageScroll(target: HTMLElement) {
  const wasFocused = activeElement(ownerDocument(target)) === target;
  const previousOpacity = target.style.opacity;
  const previousTransform = target.style.transform;
  const previousTransition = target.style.transition;

  // iOS Safari can still scroll the page for transformed sheets even with preventScroll.
  // Move the input off-screen only for the synchronous focus call.
  target.style.transition = 'none';
  target.style.opacity = '0';
  target.style.transform = 'translateY(-2000px)';
  try {
    if (wasFocused) {
      target.blur();
    }
    target.focus({ preventScroll: true });
  } finally {
    target.style.opacity = previousOpacity;
    target.style.transform = previousTransform;
    target.style.transition = previousTransition;
  }
}

function findKeyboardScrollTarget(target: HTMLElement, root: HTMLElement): HTMLElement | null {
  // Start at the parent: scrolling the focused field's own content (an overflowing
  // textarea is scrollable itself) can never move its box out from under the keyboard.
  // `getParentNode` crosses shadow boundaries so an input inside a shadow root still reaches
  // the drawer body scroller. Prefer an already-scrollable ancestor, then fall back to one
  // that only becomes scrollable once keyboard slack is added (overflow intent without
  // current overflow).
  const scrollStart = getParentNode(target);
  return (
    findScrollableTouchTarget(scrollStart, root, 'vertical') ??
    findScrollableTouchTarget(scrollStart, root, 'vertical', true)
  );
}

function getKeyboardVisualViewport(win: Window): KeyboardVisualViewport | null {
  const visualViewport = win.visualViewport;

  if (!visualViewport || visualViewport.scale !== 1) {
    return null;
  }

  const reducedHeight = win.innerHeight - visualViewport.height;
  // Treat small viewport changes as browser chrome movement, not the software keyboard.
  if (reducedHeight <= KEYBOARD_RESIZE_THRESHOLD) {
    return null;
  }

  const top = Math.max(0, visualViewport.offsetTop);
  return {
    top,
    bottom: Math.min(win.innerHeight, top + visualViewport.height),
  };
}

function getDrawerKeyboardInset(win: Window, keyboardViewport: KeyboardVisualViewport): number {
  return Math.max(0, win.innerHeight - keyboardViewport.bottom);
}

function isKeyboardVisualViewportOpen(win: Window): boolean {
  return !win.visualViewport || getKeyboardVisualViewport(win) != null;
}
