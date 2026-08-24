/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-use-signal -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createEffect, createMemo, createSignal, splitProps, type JSX } from 'solid-js';
import { createControllableSignal } from '../../base-utils/createControllableSignal';
import { createValueChanged } from '../../base-utils/createValueChanged';
import { ownerDocument } from '../../base-utils/owner';
import { warn } from '../../base-utils/warn';
import { renderElement } from '../../internals/renderElement';
import type { BaseUIComponentProps, HTMLProps, Orientation } from '../../internals/types';
import { createBaseUiId } from '../../internals/createBaseUiId';
import {
  createChangeEventDetails,
  createGenericEventDetails,
  type BaseUIChangeEventDetails,
  type BaseUIGenericEventDetails,
} from '../../internals/createBaseUIEventDetails';
import { clamp } from '../../internals/clamp';
import { areArraysEqual } from '../../internals/areArraysEqual';
import { activeElement, contains } from '../../internals/shadowDom';
import { CompositeList, type CompositeMetadata } from '../../internals/composite/list/CompositeList';
import {
  useFieldRootContext,
  type FieldRootState,
} from '../../internals/field-root-context/FieldRootContext';
import { registerFieldControl } from '../../internals/field-register-control/registerFieldControl';
import { useFormContext } from '../../internals/form-context/FormContext';
import { useLabelableContext } from '../../internals/labelable-provider/LabelableContext';
import { resolveAriaLabelledBy, getDefaultLabelId } from '../../utils/resolveAriaLabelledBy';
import { REASONS } from '../../internals/reasons';
import { asc } from '../utils/asc';
import { getSliderValue } from '../utils/getSliderValue';
import { validateMinimumDistance } from '../utils/validateMinimumDistance';
import type { ThumbMetadata } from '../thumb/SliderThumb';
import type { ThumbCollisionBehavior } from '../utils/resolveThumbCollision';
import { sliderStateAttributesMapping } from './stateAttributesMapping';
import { SliderRootContext, type SliderRootContextValue } from './SliderRootContext';

function getSliderChangeEventReason(event: Event): SliderRootChangeEventReason {
  return 'key' in event ? REASONS.keyboard : REASONS.inputChange;
}

function areValuesEqual(
  newValue: number | readonly number[],
  oldValue: number | readonly number[],
) {
  if (typeof newValue === 'number' && typeof oldValue === 'number') {
    return newValue === oldValue;
  }
  if (Array.isArray(newValue) && Array.isArray(oldValue)) {
    return areArraysEqual(newValue, oldValue);
  }
  return false;
}

/**
 * Groups all parts of the slider.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Slider](https://base-ui.com/react/components/slider)
 */
export function SliderRoot<Value extends number | readonly number[] = number | readonly number[]>(
  componentProps: SliderRoot.Props<Value>,
): JSX.Element {
  const [, elementProps] = splitProps(componentProps, [
    'aria-labelledby',
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'defaultValue',
    'disabled',
    'id',
    'format',
    'largeStep',
    'locale',
    'max',
    'min',
    'minStepsBetweenValues',
    'form',
    'name',
    'onValueChange',
    'onValueCommitted',
    'orientation',
    'step',
    'thumbCollisionBehavior',
    'thumbAlignment',
    'value',
  ]);

  const id = createBaseUiId(() => componentProps.id);
  const defaultLabelId = () => getDefaultLabelId(id());

  const disabledProp = () => componentProps.disabled ?? false;
  const min = () => componentProps.min ?? 0;
  const max = () => componentProps.max ?? 100;
  const step = () => componentProps.step ?? 1;
  const largeStep = () => componentProps.largeStep ?? 10;
  const minStepsBetweenValues = () => componentProps.minStepsBetweenValues ?? 0;
  const orientation = (): Orientation => componentProps.orientation ?? 'horizontal';
  const thumbCollisionBehavior = (): ThumbCollisionBehavior =>
    componentProps.thumbCollisionBehavior ?? 'push';
  const thumbAlignment = () => componentProps.thumbAlignment ?? 'center';
  const inset = () => thumbAlignment() !== 'center';

  const { clearErrors } = useFormContext();
  const {
    state: fieldState,
    disabled: fieldDisabled,
    name: fieldName,
    setTouched,
    setDirty,
    validityData,
    validation,
  } = useFieldRootContext();
  const { labelId: fieldLabelId } = useLabelableContext();

  const [labelId, setLabelId] = createSignal<string | undefined>(undefined);

  const ariaLabelledby = () =>
    componentProps['aria-labelledby'] ?? resolveAriaLabelledBy(fieldLabelId(), labelId());
  const disabled = () => (fieldDisabled() || disabledProp()) ?? false;
  const name = () => fieldName() ?? componentProps.name;

  // The internal value is potentially unsorted, e.g. to support frozen arrays.
  const [valueUnwrapped, setValueUnwrapped] = createControllableSignal({
    controlled: () => componentProps.value,
    default: (componentProps.defaultValue ?? min()) as Value,
    name: 'Slider',
  });

  const sliderRef: { current: HTMLElement | null } = { current: null };
  const controlRef: { current: HTMLElement | null } = { current: null };
  const thumbElements: Array<HTMLElement | null> = [];
  // The input element nested in the pressed thumb.
  const pressedInputRef: { current: HTMLInputElement | null } = { current: null };
  // The px distance between the pointer and the center of a pressed thumb.
  const pressedThumbCenterOffsetRef: { current: number | null } = { current: null };
  // The index of the pressed thumb, or the closest thumb if the `Control` was pressed.
  const pressedThumbIndexRef: { current: number } = { current: -1 };
  // The values when the current drag interaction started.
  const pressedValuesRef: { current: readonly number[] | null } = { current: null };
  const lastChangeReason: { current: SliderRootChangeEventReason } = { current: REASONS.none };

  // We can't use the :active browser pseudo-classes.
  // - The active state isn't triggered when clicking on the rail.
  // - The active state isn't transferred when inversing a range slider.
  const [active, setActiveState] = createSignal(-1);
  const [lastUsedThumbIndex, setLastUsedThumbIndex] = createSignal(-1);
  const [dragging, setDragging] = createSignal(false);
  const [thumbMap, setThumbMap] = createSignal(
    new Map<Element, CompositeMetadata<ThumbMetadata> | null>(),
  );
  const [indicatorPosition, setIndicatorPosition] = createSignal<Array<number | undefined>>([
    undefined,
    undefined,
  ]);

  const setActive = (value: number) => {
    setActiveState(value);

    if (value !== -1) {
      setLastUsedThumbIndex(value);
    }
  };

  const range = () => Array.isArray(valueUnwrapped());

  const values = createMemo<readonly number[]>(() => {
    const raw = valueUnwrapped();
    if (!Array.isArray(raw)) {
      return [clamp(raw as number, min(), max())];
    }
    return (raw as number[]).map((value) => clamp(value, min(), max())).sort(asc);
  });

  const fieldValue = (): number | readonly number[] => (range() ? values() : values()[0]);

  registerFieldControl(
    validation.inputRef,
    id,
    fieldValue,
    undefined,
    () => !disabled(),
    () => componentProps.name,
  );

  createValueChanged(fieldValue, () => {
    clearErrors(name());

    const currentValue = fieldValue();
    validation.change(currentValue);

    const initialValue = validityData().initialValue as number | readonly number[] | undefined;
    let isDirty: boolean;
    if (Array.isArray(currentValue) && Array.isArray(initialValue)) {
      isDirty = !areArraysEqual(currentValue, initialValue);
    } else {
      isDirty = currentValue !== initialValue;
    }
    setDirty(isDirty);
  });

  function setValue(newValue: number | number[], details?: SliderRootChangeEventDetails): boolean {
    if (Number.isNaN(newValue) || areValuesEqual(newValue, valueUnwrapped())) {
      return false;
    }

    const changeDetails =
      details ??
      createChangeEventDetails(REASONS.none, undefined, undefined, { activeThumbIndex: -1 });

    // Redefine target to allow name and value to be read.
    // This allows seamless integration with the most popular form libraries.
    // Clone the event to not override `target` of the original event.
    const nativeEvent = changeDetails.event;
    const EventConstructor = (nativeEvent?.constructor as typeof Event | undefined) ?? Event;
    const clonedEvent = new EventConstructor(nativeEvent.type, nativeEvent);

    Object.defineProperty(clonedEvent, 'target', {
      writable: true,
      value: { value: newValue, name: name() },
    });

    changeDetails.event = clonedEvent;

    componentProps.onValueChange?.(newValue as any, changeDetails as any);

    if (changeDetails.isCanceled) {
      return false;
    }

    lastChangeReason.current = changeDetails.reason;

    setValueUnwrapped(newValue as Value);

    return true;
  }

  function onValueCommitted(
    newValue: number | readonly number[],
    details: SliderRootCommitEventDetails,
  ) {
    componentProps.onValueCommitted?.(newValue as any, details as any);
  }

  function handleInputChange(valueInput: number, index: number, event: Event) {
    const newValue = getSliderValue(valueInput, index, min(), max(), range(), values());

    if (validateMinimumDistance(newValue, step(), minStepsBetweenValues())) {
      const reason = getSliderChangeEventReason(event);
      const applied = setValue(
        newValue,
        createChangeEventDetails(reason, event as any, undefined, { activeThumbIndex: index }),
      );
      setTouched(true);

      if (applied) {
        onValueCommitted(newValue, createGenericEventDetails(reason, event as any));
      }
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    createEffect(() => {
      if (min() >= max()) {
        warn('Slider `max` must be greater than `min`.');
      }
    });
  }

  createEffect(() => {
    const isDisabled = disabled();
    const activeEl = activeElement(ownerDocument(sliderRef.current));
    if (isDisabled && contains(sliderRef.current as Element | null, activeEl as Element | null)) {
      // This is necessary because Firefox and Safari will keep focus
      // on a disabled element.
      (activeEl as HTMLElement | null)?.blur();
    }
  });

  createEffect(() => {
    if (disabled() && active() !== -1) {
      setActive(-1);
    }
  });

  const state: SliderRoot.State = {
    get disabled() {
      return disabled();
    },
    get touched() {
      return fieldState.touched;
    },
    get dirty() {
      return fieldState.dirty;
    },
    get valid() {
      return fieldState.valid;
    },
    get filled() {
      return fieldState.filled;
    },
    get focused() {
      return fieldState.focused;
    },
    get activeThumbIndex() {
      return active();
    },
    get dragging() {
      return dragging();
    },
    get orientation() {
      return orientation();
    },
    get max() {
      return max();
    },
    get min() {
      return min();
    },
    get minStepsBetweenValues() {
      return minStepsBetweenValues();
    },
    get step() {
      return step();
    },
    get values() {
      return values();
    },
  };

  const contextValue: SliderRootContextValue = {
    active,
    lastUsedThumbIndex,
    controlRef,
    dragging,
    disabled,
    validation,
    format: () => componentProps.format,
    handleInputChange,
    indicatorPosition,
    inset,
    labelId: ariaLabelledby,
    rootLabelId: defaultLabelId,
    largeStep,
    lastChangeReason,
    locale: () => componentProps.locale,
    max,
    min,
    minStepsBetweenValues,
    form: () => componentProps.form,
    name,
    onValueCommitted,
    orientation,
    pressedInputRef,
    pressedThumbCenterOffsetRef,
    pressedThumbIndexRef,
    pressedValuesRef,
    setActive,
    setDragging,
    setIndicatorPosition,
    setLabelId,
    setValue,
    state,
    step,
    thumbCollisionBehavior,
    thumbMap,
    thumbElements,
    values,
  };

  return (
    <SliderRootContext.Provider value={contextValue}>
      <CompositeList elements={thumbElements} onMapChange={setThumbMap}>
        {renderElement('div', componentProps, {
          defaultClass: 'wheel-Slider-Root',
          slot: 'slider-root',
          state,
          ref: (el: HTMLElement) => {
            sliderRef.current = el;
          },
          props: [
            () => ({
              'aria-labelledby': ariaLabelledby(),
              id: id(),
              role: 'group',
            }),
            elementProps as HTMLProps,
            (props: HTMLProps) => validation.getValidationProps(disabled(), props),
          ],
          stateAttributesMapping: sliderStateAttributesMapping,
        })}
      </CompositeList>
    </SliderRootContext.Provider>
  );
}

export interface SliderRootState extends FieldRootState {
  /**
   * The index of the active thumb.
   */
  activeThumbIndex: number;
  /**
   * Whether the component should ignore user interaction.
   */
  disabled: boolean;
  /**
   * Whether the thumb is currently being dragged.
   */
  dragging: boolean;
  /**
   * The maximum value.
   */
  max: number;
  /**
   * The minimum value.
   */
  min: number;
  /**
   * The minimum steps between values in a range slider.
   * @default 0
   */
  minStepsBetweenValues: number;
  /**
   * The component orientation.
   */
  orientation: Orientation;
  /**
   * The step increment of the slider when incrementing or decrementing. It will snap
   * to multiples of this value. Decimal values are supported.
   * @default 1
   */
  step: number;
  /**
   * The raw number value of the slider.
   */
  values: readonly number[];
}

export interface SliderRootProps<
  Value extends number | readonly number[] = number | readonly number[],
> extends BaseUIComponentProps<'div', SliderRootState> {
  /**
   * The uncontrolled value of the slider when it's initially rendered.
   *
   * To render a controlled slider, use the `value` prop instead.
   */
  defaultValue?: Value | undefined;
  /**
   * Whether the slider should ignore user interaction.
   * @default false
   */
  disabled?: boolean | undefined;
  /**
   * Options to format the value.
   */
  format?: Intl.NumberFormatOptions | undefined;
  /**
   * The locale used by `Intl.NumberFormat` when formatting the value.
   * Defaults to the user's runtime locale.
   */
  locale?: Intl.LocalesArgument | undefined;
  /**
   * The maximum allowed value of the slider.
   * Should not be equal to min.
   * @default 100
   */
  max?: number | undefined;
  /**
   * The minimum allowed value of the slider.
   * Should not be equal to max.
   * @default 0
   */
  min?: number | undefined;
  /**
   * The minimum steps between values in a range slider.
   * @default 0
   */
  minStepsBetweenValues?: number | undefined;
  /**
   * Identifies the field when a form is submitted.
   */
  name?: string | undefined;
  /**
   * Identifies the form that owns the slider inputs.
   * Useful when the slider is rendered outside the form.
   */
  form?: string | undefined;
  /**
   * The component orientation.
   * @default 'horizontal'
   */
  orientation?: Orientation | undefined;
  /**
   * The granularity with which the slider can step through values. (A "discrete" slider.)
   * The `min` prop serves as the origin for the valid values.
   * We recommend (max - min) to be evenly divisible by the step.
   * @default 1
   */
  step?: number | undefined;
  /**
   * The granularity with which the slider can step through values when using Page Up/Page Down or Shift + Arrow Up/Arrow Down.
   * @default 10
   */
  largeStep?: number | undefined;
  /**
   * How the thumb(s) are aligned relative to `Slider.Control` when the value is at `min` or `max`:
   * - `center`: The center of the thumb is aligned with the control edge
   * - `edge`: The thumb is inset within the control such that its edge is aligned with the control edge
   * - `edge-client-only`: Same as `edge` in this port (upstream's client-only hydration deferral
   *   optimization has no Solid equivalent — see deviation note in SliderRoot.tsx)
   * @default 'center'
   */
  thumbAlignment?: 'center' | 'edge' | 'edge-client-only' | undefined;
  /**
   * Controls how thumbs behave when they collide during pointer interactions.
   *
   * - `'push'` (default): Thumbs push each other without restoring their previous positions when dragged back.
   * - `'swap'`: Thumbs swap places when dragged past each other.
   * - `'none'`: Thumbs cannot move past each other; excess movement is ignored.
   *
   * @default 'push'
   */
  thumbCollisionBehavior?: 'push' | 'swap' | 'none' | undefined;
  /**
   * The value of the slider.
   * For range sliders, provide an array with one value per thumb.
   */
  value?: Value | undefined;
  /**
   * Callback function that is fired when the slider's value changed.
   * Receives the new value as the first argument; the originating event is
   * available as `eventDetails.event`. The value is also reflected on
   * `eventDetails.event.target.value` for form integration.
   *
   * The `eventDetails.reason` indicates what triggered the change:
   *
   * - `'input-change'` when the hidden range input emits a change event (for example, via form integration)
   * - `'track-press'` when the control track is pressed
   * - `'drag'` while dragging a thumb
   * - `'keyboard'` for keyboard input
   * - `'none'` when the change is triggered without a specific interaction
   */
  onValueChange?:
    | ((
        value: Value extends number ? number : Value,
        eventDetails: SliderRoot.ChangeEventDetails,
      ) => void)
    | undefined;
  /**
   * Callback function that is fired when a value change is committed.
   * Does not fire if the value did not change, or if the change was canceled.
   * **Warning**: This is a generic event, not a change event.
   *
   * The `eventDetails.reason` indicates what triggered the commit:
   *
   * - `'drag'` while dragging a thumb
   * - `'track-press'` when the control track is pressed
   * - `'keyboard'` for keyboard input
   * - `'input-change'` when the hidden range input emits a change event (for example, via form integration)
   * - `'none'` when the commit occurs without a specific interaction
   */
  onValueCommitted?:
    | ((
        value: Value extends number ? number : Value,
        eventDetails: SliderRoot.CommitEventDetails,
      ) => void)
    | undefined;
}

export interface SliderRootChangeEventCustomProperties {
  /**
   * The index of the active thumb at the time of the change.
   */
  activeThumbIndex: number;
}

export type SliderRootChangeEventReason =
  | typeof REASONS.inputChange
  | typeof REASONS.trackPress
  | typeof REASONS.drag
  | typeof REASONS.keyboard
  | typeof REASONS.none;
export type SliderRootChangeEventDetails = BaseUIChangeEventDetails<
  SliderRootChangeEventReason,
  SliderRootChangeEventCustomProperties
>;

export type SliderRootCommitEventReason =
  | typeof REASONS.inputChange
  | typeof REASONS.trackPress
  | typeof REASONS.drag
  | typeof REASONS.keyboard
  | typeof REASONS.none;
export type SliderRootCommitEventDetails = BaseUIGenericEventDetails<SliderRootCommitEventReason>;

export namespace SliderRoot {
  export type State = SliderRootState;
  export type Props<Value extends number | readonly number[] = number | readonly number[]> =
    SliderRootProps<Value>;
  export type ChangeEventReason = SliderRootChangeEventReason;
  export type ChangeEventDetails = SliderRootChangeEventDetails;
  export type CommitEventReason = SliderRootCommitEventReason;
  export type CommitEventDetails = SliderRootCommitEventDetails;
}
