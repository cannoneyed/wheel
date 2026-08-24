/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-view-root -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createEffect, onCleanup, splitProps, For, Show, type JSX } from 'solid-js';
import { addEventListener } from '../../base-utils/addEventListener';
import { mergeCleanups } from '../../base-utils/mergeCleanups';
import { ownerDocument, ownerWindow } from '../../base-utils/owner';
import { visuallyHidden } from '../../base-utils/visuallyHidden';
import { createTimeout } from '../../base-utils/createTimeout';
import { activeElement, contains, getTarget } from '../../floating-ui-solid';
import { FocusGuard } from '../../utils/FocusGuard';
import type { BaseUIComponentProps } from '../../internals/types';
import { useToastProviderContext } from '../provider/ToastProviderContext';
import { renderElement } from '../../internals/renderElement';
import { isFocusVisible } from '../utils/focusVisible';
import { ToastViewportCssVars } from './ToastViewportCssVars';
import { stateAttributesMapping } from './stateAttributesMapping';

/**
 * A container viewport for toasts.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Toast](https://base-ui.com/react/components/toast)
 */
export function ToastViewport(componentProps: ToastViewport.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, ['class', 'style', 'as', 'asChild', 'children']);

  const store = useToastProviderContext();
  const windowFocusTimeout = createTimeout();

  let handlingFocusGuard = false;
  let markedReadyForMouseLeave = false;
  let touchActive = false;

  const isEmpty = store.useState('isEmpty');
  const toasts = store.useState('toasts');
  const focused = store.useState('focused');
  const expanded = store.useState('expanded');
  const prevFocusElement = store.useState('prevFocusElement');
  const frontmostHeight = () => toasts()[0]?.height ?? 0;

  const hasTransitioningToasts = () => toasts().some((toast) => toast.transitionStatus === 'ending');
  const highPriorityToasts = () => toasts().filter((toast) => toast.priority === 'high');
  const showFocusGuards = () => !isEmpty() && Boolean(prevFocusElement());

  // Listen globally for F6 so we can force-focus the viewport.
  createEffect(() => {
    const viewport = store.state.viewport;
    if (!viewport) {
      return;
    }

    function handleGlobalKeyDown(event: KeyboardEvent) {
      if (isEmpty()) {
        return;
      }

      if (event.key === 'F6' && getTarget(event) !== viewport) {
        event.preventDefault();
        store.setPrevFocusElement(activeElement(ownerDocument(viewport)) as HTMLElement | null);
        viewport?.focus({ preventScroll: true });
        store.pauseTimers();
        store.setFocused(true);
      }
    }

    const win = ownerWindow(viewport);
    onCleanup(addEventListener(win, 'keydown', handleGlobalKeyDown));
  });

  createEffect(() => {
    const viewport = store.state.viewport;
    if (!viewport || isEmpty()) {
      return;
    }

    const win = ownerWindow(viewport);

    function handleWindowBlur(event: FocusEvent) {
      if (getTarget(event) !== win) {
        return;
      }

      store.setIsWindowFocused(false);
      store.pauseTimers();
    }

    function handleWindowFocus(event: FocusEvent) {
      if (event.relatedTarget) {
        return;
      }

      const target = getTarget(event);
      const activeEl = activeElement(ownerDocument(viewport));
      if (
        target === win ||
        !contains(viewport, target as HTMLElement | null) ||
        !isFocusVisible(activeEl)
      ) {
        store.resumeTimers();
      }

      // Wait for the `handleFocus` event to fire.
      windowFocusTimeout.start(0, () => store.setIsWindowFocused(true));
    }

    onCleanup(
      mergeCleanups(
        addEventListener(win, 'blur', handleWindowBlur, true),
        addEventListener(win, 'focus', handleWindowFocus, true),
      ),
    );
  });

  createEffect(() => {
    const viewport = store.state.viewport;
    if (!viewport || isEmpty()) {
      return;
    }

    const doc = ownerDocument(viewport);
    onCleanup(addEventListener(doc, 'pointerdown', store.handleDocumentPointerDown, true));
  });

  function handleFocusGuard(event: FocusEvent) {
    const viewport = store.state.viewport;
    if (!viewport) {
      return;
    }

    handlingFocusGuard = true;

    // If we're coming off the container, move to the first toast that can hold
    // focus, skipping toasts that are animating out or inert because they're limited.
    if (event.relatedTarget === viewport) {
      const firstFocusableToast = toasts().find(
        (toast) => toast.transitionStatus !== 'ending' && !toast.limited,
      );
      if (firstFocusableToast) {
        firstFocusableToast.ref?.focus();
      } else {
        store.restoreFocusToPrevElement();
      }
    } else {
      store.restoreFocusToPrevElement();
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Tab' && event.shiftKey && getTarget(event) === store.state.viewport) {
      event.preventDefault();
      store.restoreFocusToPrevElement();
      // Shift+Tab is explicit keyboard navigation out of the viewport.
      store.resumeTimers();
    }
  }

  function flushMouseLeave() {
    const hasEndingToasts = store.state.toasts.some((toast) => toast.transitionStatus === 'ending');

    if (hasEndingToasts || touchActive || !markedReadyForMouseLeave) {
      return;
    }

    // Once transitions have finished, see if a mouseleave was already triggered
    // but blocked from taking effect. If so, we can now safely collapse the viewport
    // without restarting timers while the window is blurred.
    if (store.state.isWindowFocused) {
      store.resumeTimers();
    }
    store.setHovering(false);
    markedReadyForMouseLeave = false;
  }

  createEffect(() => {
    hasTransitioningToasts();
    flushMouseLeave();
  });

  function handleMouseEnter() {
    store.pauseTimers();
    store.setHovering(true);
    markedReadyForMouseLeave = false;
  }

  function resumeTimersIfWindowFocused() {
    if (store.state.isWindowFocused) {
      store.resumeTimers();
    }
  }

  function handleMouseLeave() {
    const hasEndingToasts = store.state.toasts.some((toast) => toast.transitionStatus === 'ending');

    if (hasEndingToasts || touchActive) {
      // When swiping to dismiss, wait until the transitions have settled
      // or the touch interaction ends to avoid collapsing mid-gesture.
      markedReadyForMouseLeave = true;
    } else {
      resumeTimersIfWindowFocused();
      store.setHovering(false);
    }
  }

  // Deviation: upstream attaches `onMouseEnter`/`onMouseLeave` directly, relying on React's
  // synthetic event system (which synthesizes non-bubbling enter/leave semantics on top of native
  // bubbling `mouseover`/`mouseout`). Solid attaches native listeners directly, and native
  // `mouseenter`/`mouseleave` do NOT bubble — so hovering a toast (a descendant) would never reach
  // a listener on the viewport itself. These wrappers reproduce React's enter/leave semantics
  // manually on top of the bubbling `mouseover`/`mouseout` events, using `relatedTarget` to ignore
  // moves between two descendants (matching the well-known vanilla-JS mouseenter/mouseleave
  // polyfill technique, and how React implements this internally).
  function handleMouseOver(event: MouseEvent) {
    const related = event.relatedTarget as Node | null;
    const viewport = store.state.viewport;
    if (related && viewport && contains(viewport, related as HTMLElement)) {
      return;
    }
    handleMouseEnter();
  }

  function handleMouseOut(event: MouseEvent) {
    const related = event.relatedTarget as Node | null;
    const viewport = store.state.viewport;
    if (related && viewport && contains(viewport, related as HTMLElement)) {
      return;
    }
    handleMouseLeave();
  }

  function handlePointerDown(event: PointerEvent) {
    if (event.pointerType === 'touch') {
      touchActive = true;
    }
  }

  function handlePointerEnd(event: PointerEvent) {
    if (event.pointerType !== 'touch') {
      return;
    }

    touchActive = false;
    flushMouseLeave();
  }

  function handleFocus() {
    if (handlingFocusGuard) {
      handlingFocusGuard = false;
      return;
    }

    if (focused()) {
      return;
    }

    // Only set focused when the active element is focus-visible.
    // This prevents the viewport from staying expanded when clicking inside without
    // keyboard navigation.
    if (isFocusVisible(activeElement(ownerDocument(store.state.viewport)))) {
      store.setFocused(true);
      store.pauseTimers();
    }
  }

  function handleBlur(event: FocusEvent) {
    if (!focused() || contains(store.state.viewport, event.relatedTarget as HTMLElement | null)) {
      return;
    }

    store.setFocused(false);
    resumeTimersIfWindowFocused();
  }

  const defaultProps = {
    tabIndex: -1,
    role: 'region',
    'aria-live': 'polite',
    'aria-atomic': false,
    'aria-relevant': 'additions text',
    'aria-label': 'Notifications',
    onMouseOver: handleMouseOver,
    onMouseMove: handleMouseEnter,
    onMouseOut: handleMouseOut,
    onFocus: handleFocus,
    onBlur: handleBlur,
    onKeyDown: handleKeyDown,
    onClick: handleFocus,
    onPointerDown: handlePointerDown,
    onPointerUp: handlePointerEnd,
    onPointerCancel: handlePointerEnd,
  };

  const state: ToastViewportState = {
    get expanded() {
      return expanded();
    },
  };

  return (
    <>
      <Show when={showFocusGuards()}>
        <FocusGuard onFocus={handleFocusGuard} />
      </Show>
      {renderElement('div', componentProps, {
        defaultClass: 'wheel-Toast-Viewport',
        slot: 'toast-viewport',
        ref: (el: HTMLDivElement) => store.setViewport(el),
        state,
        stateAttributesMapping,
        props: [
          defaultProps,
          () => ({
            style: {
              [ToastViewportCssVars.frontmostHeight as string]: frontmostHeight()
                ? `${frontmostHeight()}px`
                : undefined,
            },
          }),
          elementProps,
        ],
        children: () => (
          <>
            <Show when={showFocusGuards()}>
              <FocusGuard onFocus={handleFocusGuard} />
            </Show>
            {componentProps.children}
            <Show when={showFocusGuards()}>
              <FocusGuard onFocus={handleFocusGuard} />
            </Show>
          </>
        ),
      })}
      <Show when={!focused() && highPriorityToasts().length > 0}>
        <div style={visuallyHidden}>
          <For each={highPriorityToasts()}>
            {(toast) => (
              <div role="alert" aria-atomic="true">
                <div>{toast.title}</div>
                <div>{toast.description}</div>
              </div>
            )}
          </For>
        </div>
      </Show>
    </>
  );
}

export interface ToastViewportState {
  /**
   * Whether toasts are expanded in the viewport.
   */
  expanded: boolean;
}

export interface ToastViewportProps extends BaseUIComponentProps<'div', ToastViewportState> {}

export namespace ToastViewport {
  export type State = ToastViewportState;
  export type Props = ToastViewportProps;
}
