/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { onCleanup, onMount, splitProps, type JSX } from 'solid-js';
import { isElement } from '@floating-ui/utils/dom';
import { addEventListener } from '../../base-utils/addEventListener';
import { ownerDocument, ownerWindow } from '../../base-utils/owner';
import { createAnimationFrame } from '../../base-utils/createAnimationFrame';
import { activeElement, contains, getTarget } from '../../internals/shadowDom';
import { clamp } from '../../internals/clamp';
import type { BaseUIComponentProps } from '../../internals/types';
import {
  createChangeEventDetails,
  createGenericEventDetails,
} from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import { renderElement } from '../../internals/renderElement';
import { useDirection } from '../../internals/direction-context/DirectionContext';
import { useSliderRootContext } from '../root/SliderRootContext';
import { sliderStateAttributesMapping } from '../root/stateAttributesMapping';
import type { SliderRootState } from '../root/SliderRoot';
import { getMidpoint, type Coords } from '../utils/getMidpoint';
import { roundValueToStep } from '../utils/roundValueToStep';
import { validateMinimumDistance } from '../utils/validateMinimumDistance';
import { resolveThumbCollision } from '../utils/resolveThumbCollision';

const INTENTIONAL_DRAG_COUNT_THRESHOLD = 2;

function getControlOffset(styles: CSSStyleDeclaration | null, vertical: boolean) {
  if (!styles) {
    return {
      start: 0,
      end: 0,
    };
  }

  function parseSize(value: string | null | undefined) {
    const parsed = value != null ? parseFloat(value) : 0;
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  const start = !vertical ? 'InlineStart' : 'Top';
  const end = !vertical ? 'InlineEnd' : 'Bottom';

  return {
    start:
      parseSize((styles as any)[`border${start}Width`]) + parseSize((styles as any)[`padding${start}`]),
    end: parseSize((styles as any)[`border${end}Width`]) + parseSize((styles as any)[`padding${end}`]),
  };
}

function getFingerCoords(
  event: TouchEvent | PointerEvent,
  touchId: { current: number | null },
): Coords | null {
  // The event is TouchEvent
  if (touchId.current != null && (event as TouchEvent).changedTouches) {
    const touchEvent = event as TouchEvent;
    for (let i = 0; i < touchEvent.changedTouches.length; i += 1) {
      const touch = touchEvent.changedTouches[i];
      if (touch.identifier === touchId.current) {
        return {
          x: touch.clientX,
          y: touch.clientY,
        };
      }
    }

    return null;
  }

  // The event is PointerEvent
  return {
    x: (event as PointerEvent).clientX,
    y: (event as PointerEvent).clientY,
  };
}

interface FingerState {
  value: number | number[];
  thumbIndex: number;
  didSwap: boolean;
}

/**
 * The clickable, interactive part of the slider.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Slider](https://base-ui.com/react/components/slider)
 */
export function SliderControl(componentProps: SliderControl.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, ['class', 'style', 'as', 'asChild', 'children']);

  const {
    controlRef,
    disabled,
    dragging,
    inset,
    lastChangeReason,
    max,
    min,
    minStepsBetweenValues,
    onValueCommitted,
    orientation,
    pressedInputRef,
    pressedThumbCenterOffsetRef,
    pressedThumbIndexRef,
    pressedValuesRef,
    setActive,
    setDragging,
    setValue,
    state,
    step,
    thumbCollisionBehavior,
    thumbElements,
    values,
  } = useSliderRootContext();

  const direction = useDirection();
  const range = () => values().length > 1;
  const vertical = () => orientation() === 'vertical';

  let stylesRef: CSSStyleDeclaration | null = null;
  const setStylesRef = (element: HTMLElement | null) => {
    if (element && stylesRef == null) {
      stylesRef = ownerWindow(element).getComputedStyle(element);
    }
  };

  // A number that uniquely identifies the current finger in the touch session.
  const touchId: { current: number | null } = { current: null };
  // The number of touch/pointermove events that have fired.
  let moveCount = 0;
  // The offset amount to each side of the control for inset sliders.
  // This value should be equal to the radius or half the width/height of the thumb.
  let insetThumbOffset = 0;
  let currentInteractionValue: number | number[] | null = null;
  // Mirrors upstream's `useValueAsRef`: guards against stale reads within a single drag
  // session when a controlled slider doesn't synchronously echo back the applied value.
  let latestValues: readonly number[] = values();

  function updatePressedThumb(nextIndex: number) {
    if (pressedThumbIndexRef.current !== nextIndex) {
      pressedThumbIndexRef.current = nextIndex;
    }

    const thumbElement = thumbElements[nextIndex];

    if (!thumbElement) {
      pressedThumbCenterOffsetRef.current = null;
      pressedInputRef.current = null;
      return;
    }

    pressedInputRef.current = thumbElement.querySelector<HTMLInputElement>('input[type="range"]');
  }

  function resetPressedThumb() {
    pressedThumbIndexRef.current = -1;
    pressedThumbCenterOffsetRef.current = null;
    pressedInputRef.current = null;
  }

  function isTargetDisabledThumb(target: EventTarget | null) {
    if (!isElement(target)) {
      return false;
    }

    return thumbElements.some((thumbEl) => {
      if (!isElement(thumbEl) || !contains(thumbEl, target as Element)) {
        return false;
      }

      return thumbEl.querySelector<HTMLInputElement>('input[type="range"]')?.disabled === true;
    });
  }

  function getFingerState(fingerCoords: Coords): FingerState | null {
    const control = controlRef.current;
    const thumbIndex = pressedThumbIndexRef.current;
    const currentValues = values();

    if (!control || thumbIndex < 0 || thumbIndex >= currentValues.length) {
      if (thumbIndex >= currentValues.length) {
        currentInteractionValue = null;
      }
      return null;
    }

    const { width, height, bottom, left, right } = control.getBoundingClientRect();

    const controlOffset = getControlOffset(stylesRef, vertical());
    const controlSize =
      (vertical() ? height : width) - controlOffset.start - controlOffset.end - insetThumbOffset * 2;
    const thumbCenterOffset = pressedThumbCenterOffsetRef.current ?? 0;
    const fingerX = fingerCoords.x - thumbCenterOffset;
    const fingerY = fingerCoords.y - thumbCenterOffset;

    const valueSize = vertical()
      ? bottom - fingerY - controlOffset.end
      : (direction() === 'rtl' ? right - fingerX : fingerX - left) - controlOffset.start;
    // the value at the finger origin scaled down to fit the range [0, 1]
    const valueRescaled = clamp((valueSize - insetThumbOffset) / controlSize, 0, 1);

    let newValue = (max() - min()) * valueRescaled + min();
    newValue = roundValueToStep(newValue, step(), min());
    newValue = clamp(newValue, min(), max());

    if (!range()) {
      return {
        value: newValue,
        thumbIndex,
        didSwap: false,
      };
    }

    const collisionResult = resolveThumbCollision({
      behavior: thumbCollisionBehavior(),
      values: currentValues,
      currentValues: latestValues ?? currentValues,
      initialValues: pressedValuesRef.current,
      pressedIndex: thumbIndex,
      nextValue: newValue,
      min: min(),
      max: max(),
      step: step(),
      minStepsBetweenValues: minStepsBetweenValues(),
    });

    return collisionResult;
  }

  function startPressing(fingerCoords: Coords) {
    const currentValues = values();
    pressedValuesRef.current = range() ? currentValues.slice() : null;
    currentInteractionValue = null;
    latestValues = currentValues;

    const pressedThumbIndex = pressedThumbIndexRef.current;
    let closestThumbIndex = pressedThumbIndex;

    if (pressedThumbIndex > -1 && pressedThumbIndex < currentValues.length) {
      if (currentValues[pressedThumbIndex] === max()) {
        let candidateIndex = pressedThumbIndex;

        while (candidateIndex > 0 && currentValues[candidateIndex - 1] === max()) {
          candidateIndex -= 1;
        }

        closestThumbIndex = candidateIndex;
      }
    } else {
      // pressed on control
      const axis = !vertical() ? 'x' : 'y';
      let minDistance: number | undefined;

      closestThumbIndex = -1;

      for (let i = 0; i < thumbElements.length; i += 1) {
        const thumbEl = thumbElements[i];
        if (
          isElement(thumbEl) &&
          !thumbEl.querySelector<HTMLInputElement>('input[type="range"]')?.disabled
        ) {
          const midpoint = getMidpoint(thumbEl);
          const distance = Math.abs(fingerCoords[axis] - midpoint[axis]);

          if (minDistance === undefined || distance <= minDistance) {
            closestThumbIndex = i;
            minDistance = distance;
          }
        }
      }
    }

    if (closestThumbIndex > -1 && closestThumbIndex !== pressedThumbIndex) {
      updatePressedThumb(closestThumbIndex);
    }

    if (inset()) {
      const thumbEl = thumbElements[closestThumbIndex];
      if (isElement(thumbEl)) {
        const thumbRect = thumbEl.getBoundingClientRect();
        const side = !vertical() ? 'width' : 'height';
        insetThumbOffset = thumbRect[side] / 2;
      }
    }
  }

  function focusThumb(thumbIndex: number) {
    const input = thumbElements[thumbIndex]?.querySelector<HTMLInputElement>('input[type="range"]');
    if (!input) {
      return;
    }

    input.focus({
      preventScroll: true,
      // Prevent pointer-driven focus rings in browsers that support this option.
      focusVisible: false,
    } as FocusOptions);
  }

  function setValueFromPointer(
    finger: FingerState,
    reason: typeof REASONS.trackPress | typeof REASONS.drag,
    nativeEvent: TouchEvent | PointerEvent,
  ) {
    const applied = setValue(
      finger.value,
      createChangeEventDetails(reason, nativeEvent as any, undefined, {
        activeThumbIndex: finger.thumbIndex,
      }),
    );

    if (applied) {
      currentInteractionValue = finger.value;
      latestValues = Array.isArray(finger.value) ? finger.value : [finger.value];

      // Only track the swapped thumb once the change is actually applied so a
      // canceled swap doesn't leak the new index into subsequent moves.
      if (finger.didSwap) {
        updatePressedThumb(finger.thumbIndex);
      }
    }

    return applied;
  }

  function handleTouchMove(nativeEvent: TouchEvent | PointerEvent) {
    const fingerCoords = getFingerCoords(nativeEvent, touchId);

    if (fingerCoords == null) {
      return;
    }

    moveCount += 1;

    // Cancel move in case some other element consumed a pointerup event and it was not fired.
    if (nativeEvent.type === 'pointermove' && (nativeEvent as PointerEvent).buttons === 0) {
      handleTouchEnd(nativeEvent);
      return;
    }

    const finger = getFingerState(fingerCoords);

    if (finger == null) {
      return;
    }

    if (validateMinimumDistance(finger.value, step(), minStepsBetweenValues())) {
      if (!dragging() && moveCount > INTENTIONAL_DRAG_COUNT_THRESHOLD) {
        setDragging(true);
      }

      const applied = setValueFromPointer(finger, REASONS.drag, nativeEvent);

      if (applied && finger.didSwap) {
        focusThumb(finger.thumbIndex);
      }
    }
  }

  function handleTouchEnd(nativeEvent: TouchEvent | PointerEvent) {
    setActive(-1);
    setDragging(false);

    pressedInputRef.current = null;
    pressedThumbCenterOffsetRef.current = null;

    // If the value array shrank or grew mid-drag, the cached interaction value no longer
    // matches the current thumbs (the pressed index can still be in range), so dropping it
    // keeps a stale or malformed array from being committed on release.
    if (Array.isArray(currentInteractionValue) && currentInteractionValue.length !== values().length) {
      currentInteractionValue = null;
    }

    if (currentInteractionValue != null) {
      const commitReason = lastChangeReason.current;
      onValueCommitted(currentInteractionValue, createGenericEventDetails(commitReason, nativeEvent as any));
    }

    if ('pointerType' in nativeEvent && controlRef.current?.hasPointerCapture(nativeEvent.pointerId)) {
      controlRef.current?.releasePointerCapture(nativeEvent.pointerId);
    }

    pressedThumbIndexRef.current = -1;
    touchId.current = null;
    pressedValuesRef.current = null;
    currentInteractionValue = null;
    stopListening();
  }

  function handleTouchStart(nativeEvent: TouchEvent) {
    if (disabled()) {
      return;
    }

    if (isTargetDisabledThumb(getTarget(nativeEvent))) {
      resetPressedThumb();
      return;
    }

    const touch = nativeEvent.changedTouches[0];

    if (touch != null) {
      touchId.current = touch.identifier;
    }

    const fingerCoords = getFingerCoords(nativeEvent, touchId);

    if (fingerCoords != null) {
      startPressing(fingerCoords);

      const finger = getFingerState(fingerCoords);

      if (finger == null) {
        return;
      }

      focusThumb(finger.thumbIndex);
      const applied = setValueFromPointer(finger, REASONS.trackPress, nativeEvent);

      if (applied && finger.didSwap) {
        focusThumb(finger.thumbIndex);
      }
    }

    moveCount = 0;
    const doc = ownerDocument(controlRef.current);
    doc.addEventListener('touchmove', handleTouchMove as EventListener, { passive: true });
    doc.addEventListener('touchend', handleTouchEnd as EventListener, { passive: true });
  }

  function stopListening() {
    const doc = ownerDocument(controlRef.current);
    doc.removeEventListener('pointermove', handleTouchMove as EventListener);
    doc.removeEventListener('pointerup', handleTouchEnd as EventListener);
    doc.removeEventListener('touchmove', handleTouchMove as EventListener);
    doc.removeEventListener('touchend', handleTouchEnd as EventListener);
    pressedValuesRef.current = null;
    currentInteractionValue = null;
  }

  const focusFrame = createAnimationFrame();

  onMount(() => {
    const control = controlRef.current;
    if (!control) {
      onCleanup(() => stopListening());
      return;
    }

    const unsubscribeTouchStart = addEventListener(control, 'touchstart', handleTouchStart, {
      passive: true,
    });

    onCleanup(() => {
      unsubscribeTouchStart();
      focusFrame.cancel();
      stopListening();
    });
  });

  return renderElement('div', componentProps, {
    defaultClass: 'wheel-Slider-Control',
    slot: 'slider-control',
    state,
    ref: [
      (el: HTMLElement) => {
        controlRef.current = el;
      },
      setStylesRef,
    ],
    props: [
      {
        onPointerDown(event: PointerEvent) {
          const control = controlRef.current;
          const target = getTarget(event);

          if (
            !control ||
            disabled() ||
            event.defaultPrevented ||
            !isElement(target) ||
            // Only handle left clicks
            event.button !== 0
          ) {
            return;
          }

          if (isTargetDisabledThumb(target)) {
            resetPressedThumb();
            return;
          }

          const fingerCoords = getFingerCoords(event, touchId);

          if (fingerCoords != null) {
            startPressing(fingerCoords);

            const finger = getFingerState(fingerCoords);

            if (finger == null) {
              return;
            }

            const pressedOnFocusedThumb = contains(
              thumbElements[finger.thumbIndex] ?? null,
              activeElement(ownerDocument(control)) as Element | null,
            );

            if (pressedOnFocusedThumb) {
              event.preventDefault();
            } else {
              focusFrame.request(() => {
                focusThumb(finger.thumbIndex);
              });
            }

            setDragging(true);

            const pressedOnAnyThumb = pressedThumbCenterOffsetRef.current != null;
            if (!pressedOnAnyThumb) {
              const applied = setValueFromPointer(finger, REASONS.trackPress, event);

              if (applied && finger.didSwap) {
                focusThumb(finger.thumbIndex);
              }
            }
          }

          if (event.pointerId) {
            control.setPointerCapture(event.pointerId);
          }

          moveCount = 0;
          const doc = ownerDocument(controlRef.current);
          doc.addEventListener('pointermove', handleTouchMove as EventListener, { passive: true });
          doc.addEventListener('pointerup', handleTouchEnd as EventListener, { once: true });
        },
      },
      elementProps,
    ],
    stateAttributesMapping: sliderStateAttributesMapping,
  });
}

export interface SliderControlState extends SliderRootState {}

export interface SliderControlProps extends BaseUIComponentProps<'div', SliderControlState> {}

export namespace SliderControl {
  export type State = SliderControlState;
  export type Props = SliderControlProps;
}
