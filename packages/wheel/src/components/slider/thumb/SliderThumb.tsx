/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-use-signal, wheel/require-view-root -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createEffect, createSignal, onCleanup, splitProps, type JSX } from 'solid-js';
import { mergeRefs } from '../../base-utils/mergeRefs';
import { visuallyHidden } from '../../base-utils/visuallyHidden';
import { ownerWindow } from '../../base-utils/owner';
import type { BaseUIComponentProps } from '../../internals/types';
import { clamp } from '../../internals/clamp';
import { formatNumber } from '../../utils/formatNumber';
import { valueToPercent } from '../../utils/valueToPercent';
import { createBaseUiId } from '../../internals/createBaseUiId';
import { renderElement } from '../../internals/renderElement';
import { makeEventPreventable } from '../../merge-props/mergeProps';
import type { BaseUIEvent } from '../../internals/types';
import {
  ARROW_DOWN,
  ARROW_UP,
  ARROW_RIGHT,
  ARROW_LEFT,
  HOME,
  END,
  COMPOSITE_KEYS,
  PAGE_UP,
  PAGE_DOWN,
} from '../../internals/composite/composite';
import { createCompositeListItem } from '../../internals/composite/list/createCompositeListItem';
import { useDirection } from '../../internals/direction-context/DirectionContext';
import { useFieldRootContext } from '../../internals/field-root-context/FieldRootContext';
import { contains } from '../../internals/shadowDom';
import { matchesFocusVisible } from '../../floating-ui-solid/utils/element';
import { useLabelableId } from '../../internals/labelable-provider/useLabelableId';
import { getMidpoint } from '../utils/getMidpoint';
import { getSliderValue } from '../utils/getSliderValue';
import { getDecimalPrecision, roundValueToStep } from '../utils/roundValueToStep';
import type { SliderRootState } from '../root/SliderRoot';
import { useSliderRootContext } from '../root/SliderRootContext';
import { sliderStateAttributesMapping } from '../root/stateAttributesMapping';
import { SliderThumbDataAttributes } from './SliderThumbDataAttributes';

const ALL_KEYS = new Set([...COMPOSITE_KEYS, PAGE_UP, PAGE_DOWN]);

function getDefaultAriaValueText(
  values: readonly number[],
  index: number,
  format: Intl.NumberFormatOptions | undefined,
  locale: Intl.LocalesArgument | undefined,
): string | undefined {
  if (index < 0) {
    return undefined;
  }

  if (values.length === 2) {
    if (index === 0) {
      return `${formatNumber(values[index], locale, format)} start range`;
    }

    return `${formatNumber(values[index], locale, format)} end range`;
  }

  return format ? formatNumber(values[index], locale, format) : undefined;
}

function getNewValue(
  thumbValue: number,
  increment: number,
  direction: 1 | -1,
  min: number,
  max: number,
): number {
  const value = direction === 1 ? thumbValue + increment : thumbValue - increment;
  const roundedValue = Number(
    value.toFixed(
      Math.max(
        getDecimalPrecision(thumbValue),
        getDecimalPrecision(increment),
        getDecimalPrecision(min),
      ),
    ),
  );
  return clamp(roundedValue, min, max);
}

/**
 * The draggable part of the slider at the tip of the indicator.
 * Renders a `<div>` element and a nested `<input type="range">`.
 *
 * Documentation: [Base UI Slider](https://base-ui.com/react/components/slider)
 */
export function SliderThumb(componentProps: SliderThumb.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'aria-describedby',
    'aria-label',
    'aria-labelledby',
    'aria-valuetext',
    'disabled',
    'getAriaLabel',
    'getAriaValueText',
    'id',
    'index',
    'inputRef',
    'onBlur',
    'onFocus',
    'onKeyDown',
    'tabIndex',
  ]);

  const id = createBaseUiId(() => componentProps.id);

  const {
    active: activeIndex,
    lastUsedThumbIndex,
    controlRef,
    disabled: contextDisabled,
    validation,
    format,
    handleInputChange,
    inset,
    labelId,
    largeStep,
    locale,
    max,
    min,
    minStepsBetweenValues,
    form,
    name,
    orientation,
    pressedInputRef,
    pressedThumbCenterOffsetRef,
    pressedThumbIndexRef,
    setActive,
    setIndicatorPosition,
    state,
    step,
    values: sliderValues,
  } = useSliderRootContext();

  const direction = useDirection();

  const disabledProp = () => componentProps.disabled ?? false;
  const disabled = () => disabledProp() || contextDisabled();
  const range = () => sliderValues().length > 1;
  const vertical = () => orientation() === 'vertical';
  const rtl = () => direction() === 'rtl';

  const { setTouched, setFocused, validationMode } = useFieldRootContext();

  let thumbRef: HTMLElement | undefined;
  let inputRef: HTMLInputElement | undefined;
  let restoringFocusVisible = false;

  const defaultInputId = createBaseUiId();
  const labelableId = useLabelableId();
  const inputId = () => (range() ? defaultInputId() : labelableId());

  const { ref: listItemRef, index: compositeIndex } = createCompositeListItem<ThumbMetadata>({
    metadata: () => ({ inputId: inputId() }),
  });

  const index = () => (!range() ? 0 : (componentProps.index ?? compositeIndex()));
  const last = () => index() === sliderValues().length - 1;
  const thumbValue = () => sliderValues()[index()];
  const thumbValuePercent = () => valueToPercent(thumbValue(), min(), max());

  const [positionPercent, setPositionPercent] = createSignal<number | undefined>(undefined);

  const safeLastUsedThumbIndex = () =>
    lastUsedThumbIndex() >= 0 && lastUsedThumbIndex() < sliderValues().length
      ? lastUsedThumbIndex()
      : -1;

  function getInsetPosition() {
    const control = controlRef.current;
    const thumb = thumbRef;
    if (!control || !thumb) {
      return;
    }

    const thumbRect = thumb.getBoundingClientRect();
    const controlRect = control.getBoundingClientRect();

    const side = vertical() ? 'height' : 'width';
    // the total travel distance adjusted to account for the thumb size
    const controlSize = controlRect[side] - thumbRect[side];
    // px distance from the starting edge (inline-start or bottom) to the thumb center
    const thumbOffsetFromControlEdge =
      thumbRect[side] / 2 + (controlSize * thumbValuePercent()) / 100;
    const nextPositionPercent = (thumbOffsetFromControlEdge / controlRect[side]) * 100;
    const nextInsetPosition = Number.isFinite(nextPositionPercent) ? nextPositionPercent : undefined;

    setPositionPercent(nextInsetPosition);

    if (index() === 0) {
      setIndicatorPosition((prevPosition) => [nextInsetPosition, prevPosition[1]]);
    } else if (last()) {
      setIndicatorPosition((prevPosition) => [prevPosition[0], nextInsetPosition]);
    }
  }

  createEffect(() => {
    if (inset()) {
      queueMicrotask(getInsetPosition);
    }
  });

  createEffect(() => {
    thumbValuePercent();
    if (inset()) {
      getInsetPosition();
    }
  });

  createEffect(() => {
    if (!inset()) {
      return;
    }

    const control = controlRef.current;
    const thumb = thumbRef;

    if (!control || !thumb) {
      return;
    }

    const ResizeObserverCtor = ownerWindow(control).ResizeObserver;
    if (typeof ResizeObserverCtor !== 'function') {
      return;
    }

    const resizeObserver = new ResizeObserverCtor(getInsetPosition);

    resizeObserver.observe(control);
    resizeObserver.observe(thumb);

    onCleanup(() => {
      resizeObserver.disconnect();
    });
  });

  const startEdge = () => (vertical() ? 'bottom' : 'inset-inline-start');
  const crossOffsetProperty = () => (vertical() ? 'left' : 'top');

  const zIndex = () => {
    if (range()) {
      if (activeIndex() === index()) {
        return 2;
      }
      if (safeLastUsedThumbIndex() === index()) {
        return 1;
      }
      return undefined;
    }
    if (activeIndex() === index()) {
      return 1;
    }
    return undefined;
  };

  const thumbStyle = (): Record<string, unknown> => {
    if (inset()) {
      return {
        '--position': `${positionPercent() ?? 0}%`,
        visibility: positionPercent() === undefined ? 'hidden' : undefined,
        position: 'absolute',
        [startEdge()]: 'var(--position)',
        [crossOffsetProperty()]: '50%',
        translate: `${(vertical() || !rtl() ? -1 : 1) * 50}% ${(vertical() ? 1 : -1) * 50}%`,
        'z-index': zIndex(),
      };
    }

    if (!Number.isFinite(thumbValuePercent())) {
      return visuallyHidden as Record<string, unknown>;
    }

    return {
      position: 'absolute',
      [startEdge()]: `${thumbValuePercent()}%`,
      [crossOffsetProperty()]: '50%',
      translate: `${(vertical() || !rtl() ? -1 : 1) * 50}% ${(vertical() ? 1 : -1) * 50}%`,
      'z-index': zIndex(),
    };
  };

  const cssWritingMode = () => {
    if (orientation() === 'vertical') {
      return rtl() ? 'vertical-rl' : 'vertical-lr';
    }
    return undefined;
  };

  const ariaLabel = () =>
    typeof componentProps.getAriaLabel === 'function'
      ? componentProps.getAriaLabel(index())
      : componentProps['aria-label'];

  const ariaLabelledBy = () =>
    componentProps['aria-labelledby'] ?? (ariaLabel() == null ? labelId() : undefined);

  const ariaValueText = () => {
    if (typeof componentProps.getAriaValueText === 'function') {
      return componentProps.getAriaValueText(
        formatNumber(thumbValue(), locale(), format()),
        thumbValue(),
        index(),
      );
    }
    return componentProps['aria-valuetext'] ?? getDefaultAriaValueText(sliderValues(), index(), format(), locale());
  };

  function onFocus(event: FocusEvent) {
    makeEventPreventable(event as unknown as BaseUIEvent);
    const isRestoringFocusVisible = restoringFocusVisible;
    restoringFocusVisible = false;

    if (!isRestoringFocusVisible) {
      componentProps.onFocus?.(event as any);
    }

    if (!(event as unknown as BaseUIEvent).baseUIHandlerPrevented) {
      setActive(index());
      setFocused(true);
    }

    if (isRestoringFocusVisible) {
      event.stopPropagation();
    }
  }

  function onBlur(event: FocusEvent) {
    if (restoringFocusVisible) {
      event.stopPropagation();
      return;
    }

    makeEventPreventable(event as unknown as BaseUIEvent);
    componentProps.onBlur?.(event as any);

    if ((event as unknown as BaseUIEvent).baseUIHandlerPrevented) {
      return;
    }

    if (!thumbRef) {
      return;
    }

    setActive(-1);

    // Keep field-level blur logic from running while focus moves to another thumb
    // of the same slider, so validation doesn't commit mid-interaction.
    if (contains(controlRef.current, event.relatedTarget as Element | null)) {
      return;
    }

    setTouched(true);
    setFocused(false);

    if (validationMode() === 'onBlur') {
      validation.commit(getSliderValue(thumbValue(), index(), min(), max(), range(), sliderValues()));
    }
  }

  function onKeyDown(event: KeyboardEvent) {
    // The user's forwarded handler runs on every keydown, regardless of whether the
    // slider recognizes the key (matches upstream's `mergeProps` composition, where the
    // forwarded `onKeyDown` and the internal step-handling `onKeyDown` are independent
    // handlers chained together, not a single gated function).
    makeEventPreventable(event as unknown as BaseUIEvent);
    componentProps.onKeyDown?.(event as any);
    if ((event as unknown as BaseUIEvent).baseUIHandlerPrevented) {
      return;
    }

    if (event.defaultPrevented) {
      return;
    }

    if (!ALL_KEYS.has(event.key)) {
      return;
    }

    if (COMPOSITE_KEYS.has(event.key)) {
      event.stopPropagation();
    }

    let newValue: number | null = null;
    const roundedValue = roundValueToStep(thumbValue(), step(), min());
    switch (event.key) {
      case ARROW_UP:
        newValue = getNewValue(roundedValue, event.shiftKey ? largeStep() : step(), 1, min(), max());
        break;
      case ARROW_RIGHT:
        newValue = getNewValue(
          roundedValue,
          event.shiftKey ? largeStep() : step(),
          rtl() ? -1 : 1,
          min(),
          max(),
        );
        break;
      case ARROW_DOWN:
        newValue = getNewValue(roundedValue, event.shiftKey ? largeStep() : step(), -1, min(), max());
        break;
      case ARROW_LEFT:
        newValue = getNewValue(
          roundedValue,
          event.shiftKey ? largeStep() : step(),
          rtl() ? 1 : -1,
          min(),
          max(),
        );
        break;
      case PAGE_UP:
        newValue = getNewValue(roundedValue, largeStep(), 1, min(), max());
        break;
      case PAGE_DOWN:
        newValue = getNewValue(roundedValue, largeStep(), -1, min(), max());
        break;
      case END: {
        const values = sliderValues();
        newValue = max();
        if (range()) {
          newValue = Number.isFinite(values[index() + 1])
            ? values[index() + 1] - step() * minStepsBetweenValues()
            : max();
        }
        break;
      }
      case HOME: {
        const values = sliderValues();
        newValue = min();
        if (range()) {
          newValue = Number.isFinite(values[index() - 1])
            ? values[index() - 1] + step() * minStepsBetweenValues()
            : min();
        }
        break;
      }
      default:
        break;
    }

    if (newValue !== null) {
      const input = event.currentTarget as HTMLInputElement;

      if (!matchesFocusVisible(input)) {
        restoringFocusVisible = true;
        input.blur();
        input.focus({
          preventScroll: true,
          // Show `:focus-visible` after keyboard interaction, even if the
          // thumb was previously focused by a pointer.
          focusVisible: true,
        } as FocusOptions);
      }

      handleInputChange(newValue, index(), event);
      event.preventDefault();
    }
  }

  function onInputChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    handleInputChange(input.valueAsNumber, index(), event);

    // Unlike React, Solid doesn't re-assert a controlled `<input>`'s `value` on every
    // commit — only when the bound signal itself changes. Resync explicitly so a
    // rejected (invalid/no-op/canceled) change reverts the native `value`.
    const current = sliderValues()[index()];
    if (current !== undefined) {
      input.value = String(current);
    }
  }

  const mergedInputRef = mergeRefs<HTMLInputElement>(
    (el) => {
      inputRef = el;
    },
    (el) => {
      validation.inputRef.current = el;
    },
    componentProps.inputRef,
  );

  function onPointerDown(event: PointerEvent) {
    // Keep disabled thumbs from writing transient pointer state.
    if (disabled()) {
      return;
    }

    pressedThumbIndexRef.current = index();

    if (thumbRef != null) {
      const axis = orientation() === 'horizontal' ? 'x' : 'y';
      const midpoint = getMidpoint(thumbRef);
      const offset = (orientation() === 'horizontal' ? event.clientX : event.clientY) - midpoint[axis];
      pressedThumbCenterOffsetRef.current = offset;
    }

    if (inputRef != null && pressedInputRef.current !== inputRef) {
      pressedInputRef.current = inputRef;
    }
  }

  return renderElement('div', componentProps, {
    defaultClass: 'wheel-Slider-Thumb',
    slot: 'slider-thumb',
    state,
    ref: [
      listItemRef,
      (el: HTMLElement) => {
        thumbRef = el;
      },
    ],
    props: [
      () => ({
        [SliderThumbDataAttributes.index as string]: index(),
        id: id(),
        onPointerDown,
        style: thumbStyle(),
      }),
      elementProps,
    ],
    stateAttributesMapping: sliderStateAttributesMapping,
    children: () => (
      <>
        {componentProps.children}
        <input
          ref={mergedInputRef}
          aria-label={ariaLabel()}
          aria-labelledby={ariaLabelledBy()}
          aria-describedby={componentProps['aria-describedby']}
          aria-orientation={orientation()}
          aria-valuenow={thumbValue()}
          aria-valuetext={ariaValueText()}
          aria-invalid={state.valid === false && !state.disabled && !disabled() ? true : undefined}
          disabled={disabled()}
          form={form()}
          id={inputId()}
          max={max()}
          min={min()}
          name={name()}
          onChange={onInputChange}
          onFocus={onFocus}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          step={step()}
          style={{
            ...(visuallyHidden as Record<string, unknown>),
            // So that VoiceOver's focus indicator matches the thumb's dimensions
            width: '100%',
            height: '100%',
            'writing-mode': cssWritingMode(),
          }}
          tabIndex={componentProps.tabIndex}
          type="range"
          value={thumbValue() ?? ''}
        />
      </>
    ),
  });
}

export interface ThumbMetadata {
  inputId: string | undefined;
}

export interface SliderThumbState extends SliderRootState {}

export interface SliderThumbProps
  extends Omit<BaseUIComponentProps<'div', SliderThumbState>, 'onBlur' | 'onFocus' | 'onKeyDown'> {
  /**
   * Whether the thumb should ignore user interaction.
   * @default false
   */
  disabled?: boolean | undefined;
  /**
   * A string value forwarded to the `aria-valuetext` attribute of the `input`.
   * Ignored when `getAriaValueText` is provided.
   */
  'aria-valuetext'?: string | undefined;
  /**
   * A function which returns a string value for the `aria-label` attribute of the `input`.
   */
  getAriaLabel?: ((index: number) => string) | null | undefined;
  /**
   * A function which returns a string value for the `aria-valuetext` attribute of the `input`.
   * This is important for screen reader users.
   */
  getAriaValueText?: ((formattedValue: string, value: number, index: number) => string) | null | undefined;
  /**
   * The index of the thumb which corresponds to the index of its value in the
   * `value` or `defaultValue` array.
   * @example
   * ```tsx
   * <Slider.Root value={[10, 20]}>
   *   <Slider.Thumb index={0} />
   *   <Slider.Thumb index={1} />
   * </Slider.Root>
   * ```
   */
  index?: number | undefined;
  /**
   * A ref to access the nested input element.
   */
  inputRef?: ((el: HTMLInputElement) => void) | undefined;
  /**
   * A blur handler forwarded to the `input`.
   */
  onBlur?: ((event: FocusEvent) => void) | undefined;
  /**
   * A focus handler forwarded to the `input`.
   */
  onFocus?: ((event: FocusEvent) => void) | undefined;
  /**
   * A keydown handler forwarded to the `input`.
   */
  onKeyDown?: ((event: KeyboardEvent) => void) | undefined;
  /**
   * Optional tab index attribute forwarded to the `input`.
   */
  tabIndex?: number | undefined;
}

export namespace SliderThumb {
  export type State = SliderThumbState;
  export type Props = SliderThumbProps;
}
