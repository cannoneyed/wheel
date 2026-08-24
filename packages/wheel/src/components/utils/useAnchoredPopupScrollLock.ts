import { createEffect, createSignal, type Accessor } from 'solid-js';
import { ownerDocument } from '../base-utils/owner';
import { createScrollLock } from './createScrollLock';

// Touch-opened popups normally avoid scroll locking so users can still swipe outside to dismiss.
// This re-enables scroll lock only when the popup is effectively full-width.
// Treat popups with up to 20px of total horizontal gutter as full-width so common ~10px side
// padding still locks scroll, since that leaves too little outside space for a reliable swipe.
const VIEWPORT_WIDTH_TOLERANCE_PX = 20;

/**
 * Manages scroll lock for anchored popups. For non-touch opens, scroll lock is applied when
 * enabled. For touch opens, scroll lock is applied only when the positioner width is effectively
 * viewport-sized.
 * Solid port of upstream's `useAnchoredPopupScrollLock`, built on the shared `createScrollLock`
 * primitive (ported for Dialog/AlertDialog).
 */
export function useAnchoredPopupScrollLock(
  enabled: Accessor<boolean>,
  touchOpen: Accessor<boolean>,
  positionerElement: Accessor<HTMLElement | null>,
  referenceElement: Accessor<Element | null>,
) {
  const [touchOpenShouldLockScroll, setTouchOpenShouldLockScroll] = createSignal(false);

  createEffect(() => {
    const isEnabled = enabled();
    const isTouchOpen = touchOpen();
    const positioner = positionerElement();

    if (!isEnabled || !isTouchOpen || positioner == null) {
      setTouchOpenShouldLockScroll(false);
      return;
    }

    const viewportWidth = ownerDocument(positioner).documentElement.clientWidth;
    const popupWidth = positioner.offsetWidth;

    setTouchOpenShouldLockScroll(
      viewportWidth > 0 && popupWidth > 0 && popupWidth >= viewportWidth - VIEWPORT_WIDTH_TOLERANCE_PX,
    );
  });

  createScrollLock(
    () => enabled() && (!touchOpen() || touchOpenShouldLockScroll()),
    referenceElement,
  );
}
