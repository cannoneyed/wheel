/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { useSignal } from '../../../core/local-state';
import { createEffect, onCleanup, splitProps, type JSX } from 'solid-js';
import { addEventListener } from '../../base-utils/addEventListener';
import { mergeCleanups } from '../../base-utils/mergeCleanups';
import { ownerWindow, ownerDocument } from '../../base-utils/owner';
import { platform } from '../../base-utils/platform/index';
import { createTimeout } from '../../base-utils/createTimeout';
import type { BaseUIComponentProps, HTMLProps } from '../../internals/types';
import { useNumberFieldRootContext } from '../root/NumberFieldRootContext';
import type { NumberFieldRootState } from '../root/NumberFieldRoot';
import { stateAttributesMapping } from '../utils/stateAttributesMapping';
import { NumberFieldScrubAreaContext } from './NumberFieldScrubAreaContext';
import { renderElement } from '../../internals/renderElement';
import { getViewportRect } from '../utils/getViewportRect';
import { subscribeToVisualViewportResize } from '../utils/subscribeToVisualViewportResize';
import { createGenericEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import { getTarget } from '../../internals/shadowDom';

const SCRUB_AREA_STYLE = {
  'touch-action': 'none',
  '-webkit-user-select': 'none',
  'user-select': 'none',
} as const;

/**
 * An interactive area where the user can click and drag to change the field value.
 * Renders a `<span>` element.
 *
 * Documentation: [Base UI Number Field](https://base-ui.com/react/components/number-field)
 *
 * Deviation: upstream wraps its two `setIsScrubbing` calls (the scrub area's local state and the
 * root's shared state) in `ReactDOM.flushSync` so both re-render together before reading layout in
 * the same tick. Solid signal writes already apply synchronously with no separate commit phase, so
 * `flushSync` has no equivalent here and both setters are simply called in sequence.
 */
export function NumberFieldScrubArea(componentProps: NumberFieldScrubArea.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'direction',
    'pixelSensitivity',
    'teleportDistance',
  ]);

  const direction = () => componentProps.direction ?? 'horizontal';
  const pixelSensitivity = () => componentProps.pixelSensitivity ?? 2;
  const teleportDistance = () => componentProps.teleportDistance;

  const context = useNumberFieldRootContext();
  const {
    state,
    setIsScrubbing: setRootScrubbing,
    disabled,
    readOnly,
    inputRef,
    incrementValue,
    allowInputSyncRef,
    getStepAmount,
    onValueCommitted,
    lastChangedValueRef,
    valueRef,
  } = context;

  const scrubAreaRef: { current: HTMLSpanElement | null } = { current: null };

  let isScrubbingActive = false;
  let didMove = false;
  let pointerDownTarget: EventTarget | null = null;
  const scrubAreaCursorRef: { current: HTMLSpanElement | null } = { current: null };
  const virtualCursorCoords: { current: { x: number; y: number } } = { current: { x: 0, y: 0 } };
  const visualScaleRef: { current: number } = { current: 1 };

  const exitPointerLockTimeout = createTimeout();

  const [isTouchInput, setIsTouchInput] = useSignal(false, 'isTouchInput');
  const [isPointerLockDenied, setIsPointerLockDenied] = useSignal(false, 'isPointerLockDenied');
  const [isScrubbing, setIsScrubbing] = useSignal(false, 'isScrubbing');

  createEffect(() => {
    if (!isScrubbing() || !scrubAreaCursorRef.current) {
      return;
    }

    onCleanup(subscribeToVisualViewportResize(scrubAreaCursorRef.current, visualScaleRef));
  });

  function updateCursorTransform(x: number, y: number) {
    if (scrubAreaCursorRef.current) {
      scrubAreaCursorRef.current.style.transform = `translate3d(${x}px,${y}px,0) scale(${1 / visualScaleRef.current})`;
    }
  }

  function onScrub({ movementX, movementY }: PointerEvent) {
    const virtualCursor = scrubAreaCursorRef.current;
    const scrubAreaEl = scrubAreaRef.current;

    if (!virtualCursor || !scrubAreaEl) {
      return;
    }

    const rect = getViewportRect(teleportDistance(), scrubAreaEl);

    const coords = virtualCursorCoords.current;
    const newCoords = {
      x: Math.round(coords.x + movementX),
      y: Math.round(coords.y + movementY),
    };

    const cursorWidth = virtualCursor.offsetWidth;
    const cursorHeight = virtualCursor.offsetHeight;

    if (newCoords.x + cursorWidth / 2 < rect.left) {
      newCoords.x = rect.right - cursorWidth / 2;
    } else if (newCoords.x + cursorWidth / 2 > rect.right) {
      newCoords.x = rect.left - cursorWidth / 2;
    }

    if (newCoords.y + cursorHeight / 2 < rect.top) {
      newCoords.y = rect.bottom - cursorHeight / 2;
    } else if (newCoords.y + cursorHeight / 2 > rect.bottom) {
      newCoords.y = rect.top - cursorHeight / 2;
    }

    virtualCursorCoords.current = newCoords;

    updateCursorTransform(newCoords.x, newCoords.y);
  }

  function onScrubbingChange(scrubbingValue: boolean, event: { clientX: number; clientY: number }) {
    setIsScrubbing(scrubbingValue);
    setRootScrubbing(scrubbingValue);

    const virtualCursor = scrubAreaCursorRef.current;
    if (!virtualCursor || !scrubbingValue) {
      return;
    }

    const initialCoords = {
      x: event.clientX - virtualCursor.offsetWidth / 2,
      y: event.clientY - virtualCursor.offsetHeight / 2,
    };

    virtualCursorCoords.current = initialCoords;

    updateCursorTransform(initialCoords.x, initialCoords.y);
  }

  // Only listen while actively scrubbing; avoids unrelated pointerup events committing.
  createEffect(function registerGlobalScrubbingEventListeners() {
    if (!inputRef.current || disabled() || readOnly() || !isScrubbing()) {
      return;
    }

    let cumulativeDelta = 0;

    function handleScrubPointerUp(event: PointerEvent) {
      function handler() {
        try {
          ownerDocument(scrubAreaRef.current).exitPointerLock();
        } catch {
          // Ignore errors.
        } finally {
          isScrubbingActive = false;
          onScrubbingChange(false, event);
          onValueCommitted(
            lastChangedValueRef.current ?? valueRef.current,
            createGenericEventDetails(REASONS.scrub, event),
          );

          // Manually dispatch a click event if no movement happened, since
          // preventDefault on pointerdown prevents the browser click event.
          const input = inputRef.current;
          if (!didMove && pointerDownTarget != null && input) {
            pointerDownTarget.dispatchEvent(
              new (ownerWindow(input).MouseEvent)('click', {
                bubbles: true,
                cancelable: true,
              }),
            );
          }

          didMove = false;
          pointerDownTarget = null;
        }
      }

      if (platform.engine.gecko) {
        // Firefox needs a small delay here when soft-clicking as the pointer
        // lock will not release otherwise.
        exitPointerLockTimeout.start(20, handler);
      } else {
        handler();
      }
    }

    function handleScrubPointerMove(event: PointerEvent) {
      if (!isScrubbingActive) {
        return;
      }

      // Prevent text selection.
      event.preventDefault();

      onScrub(event);

      const { movementX, movementY } = event;

      cumulativeDelta += direction() === 'vertical' ? movementY : movementX;

      if (Math.abs(cumulativeDelta) >= pixelSensitivity()) {
        cumulativeDelta = 0;
        didMove = true;
        const dValue = direction() === 'vertical' ? -movementY : movementX;
        const stepAmount = getStepAmount(event);
        const rawAmount = dValue * stepAmount;

        if (rawAmount !== 0) {
          allowInputSyncRef.current = true;
          incrementValue(Math.abs(rawAmount), {
            direction: rawAmount >= 0 ? 1 : -1,
            event,
            reason: REASONS.scrub,
          });
        }
      }
    }

    const win = ownerWindow(inputRef.current);
    const unsubscribe = mergeCleanups(
      addEventListener(win, 'pointerup', handleScrubPointerUp, true),
      addEventListener(win, 'pointermove', handleScrubPointerMove, true),
    );

    onCleanup(() => {
      exitPointerLockTimeout.clear();
      unsubscribe();
    });
  });

  // If the scrub area unmounts mid-scrub, release pointer lock and clear the root's scrubbing
  // state so it doesn't stay locked or stuck. (No commit: there's no pointer release here.)
  onCleanup(() => {
    if (isScrubbingActive) {
      isScrubbingActive = false;
      setRootScrubbing(false);
      try {
        ownerDocument(scrubAreaRef.current).exitPointerLock();
      } catch {
        // Ignore errors.
      }
    }
  });

  // Prevent scrolling using touch input when scrubbing.
  createEffect(function registerScrubberTouchPreventListener() {
    const element = scrubAreaRef.current;
    if (!element || disabled() || readOnly()) {
      return;
    }

    function handleTouchStart(event: TouchEvent) {
      if (event.touches.length === 1) {
        event.preventDefault();
      }
    }

    onCleanup(addEventListener(element, 'touchstart', handleTouchStart));
  });

  const defaultProps: HTMLProps = {
    role: 'presentation',
    style: SCRUB_AREA_STYLE,
    async onPointerDown(event: PointerEvent) {
      const isMainButton = !event.button || event.button === 0;
      if (event.defaultPrevented || readOnly() || !isMainButton || disabled()) {
        return;
      }

      const isTouch = event.pointerType === 'touch';
      setIsTouchInput(isTouch);

      if (event.pointerType === 'mouse') {
        event.preventDefault();
        inputRef.current?.focus();
      }

      isScrubbingActive = true;
      didMove = false;
      pointerDownTarget = getTarget(event);
      onScrubbingChange(true, event);

      // WebKit causes significant layout shift with the native message, so we can't use it.
      if (!isTouch && !platform.engine.webkit) {
        try {
          // Avoid non-deterministic errors in testing environments. This error sometimes
          // appears:
          // "The root document of this element is not valid for pointer lock."
          await ownerDocument(scrubAreaRef.current).body.requestPointerLock();
          setIsPointerLockDenied(false);
        } catch {
          setIsPointerLockDenied(true);
        } finally {
          if (isScrubbingActive) {
            onScrubbingChange(true, event);
          }
        }
      }
    },
  };

  const contextValue: NumberFieldScrubAreaContext = {
    isScrubbing,
    isTouchInput,
    isPointerLockDenied,
    scrubAreaCursorRef,
  };

  return (
    <NumberFieldScrubAreaContext.Provider value={contextValue}>
      {renderElement('span', componentProps, {
        defaultClass: 'wheel-NumberField-ScrubArea',
        slot: 'number-field-scrub-area',
        ref: (el: HTMLElement) => {
          scrubAreaRef.current = el as HTMLSpanElement;
        },
        state,
        props: [defaultProps, elementProps as Record<string, any>],
        stateAttributesMapping,
      })}
    </NumberFieldScrubAreaContext.Provider>
  );
}

export interface NumberFieldScrubAreaState extends NumberFieldRootState {}

export interface NumberFieldScrubAreaProps
  extends BaseUIComponentProps<'span', NumberFieldScrubAreaState> {
  /**
   * Cursor movement direction in the scrub area.
   * @default 'horizontal'
   */
  direction?: 'horizontal' | 'vertical' | undefined;
  /**
   * Determines how many pixels the cursor must move before the value changes.
   * A higher value will make scrubbing less sensitive.
   * @default 2
   */
  pixelSensitivity?: number | undefined;
  /**
   * If specified, determines the distance that the cursor may move from the center
   * of the scrub area before it will loop back around.
   */
  teleportDistance?: number | undefined;
}

export namespace NumberFieldScrubArea {
  export type State = NumberFieldScrubAreaState;
  export type Props = NumberFieldScrubAreaProps;
}
