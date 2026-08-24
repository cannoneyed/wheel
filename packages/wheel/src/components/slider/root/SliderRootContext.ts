/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext, type Accessor } from 'solid-js';
import type { Orientation } from '../../internals/types';
import type { CompositeMetadata } from '../../internals/composite/list/CompositeList';
import type { FieldValidation } from '../../internals/field-root-context/FieldRootContext';
import type { ThumbMetadata } from '../thumb/SliderThumb';
import type { ThumbCollisionBehavior } from '../utils/resolveThumbCollision';
import type { SliderRoot, SliderRootState } from './SliderRoot';

export interface SliderRootContextValue {
  /**
   * The index of the active thumb.
   */
  active: Accessor<number>;
  /**
   * The index of the most recently interacted thumb.
   */
  lastUsedThumbIndex: Accessor<number>;
  controlRef: { current: HTMLElement | null };
  dragging: Accessor<boolean>;
  disabled: Accessor<boolean>;
  validation: FieldValidation;
  /**
   * Options to format the value.
   */
  format: Accessor<Intl.NumberFormatOptions | undefined>;
  handleInputChange: (valueInput: number, index: number, event: Event) => void;
  indicatorPosition: Accessor<Array<number | undefined>>;
  inset: Accessor<boolean>;
  labelId: Accessor<string | undefined>;
  rootLabelId: Accessor<string | undefined>;
  /**
   * The large step value of the slider when incrementing or decrementing while the shift key is held,
   * or when using Page-Up or Page-Down keys. Snaps to multiples of this value.
   * @default 10
   */
  largeStep: Accessor<number>;
  lastChangeReason: { current: SliderRoot.ChangeEventReason };
  /**
   * The locale used by `Intl.NumberFormat` when formatting the value.
   * Defaults to the user's runtime locale.
   */
  locale: Accessor<Intl.LocalesArgument | undefined>;
  /**
   * The maximum allowed value of the slider.
   */
  max: Accessor<number>;
  /**
   * The minimum allowed value of the slider.
   */
  min: Accessor<number>;
  /**
   * The minimum steps between values in a range slider.
   */
  minStepsBetweenValues: Accessor<number>;
  form: Accessor<string | undefined>;
  name: Accessor<string | undefined>;
  /**
   * Function to be called when drag ends and the pointer is released.
   */
  onValueCommitted: (
    newValue: number | readonly number[],
    data: SliderRoot.CommitEventDetails,
  ) => void;
  /**
   * The component orientation.
   * @default 'horizontal'
   */
  orientation: Accessor<Orientation>;
  pressedInputRef: { current: HTMLInputElement | null };
  pressedThumbCenterOffsetRef: { current: number | null };
  pressedThumbIndexRef: { current: number };
  pressedValuesRef: { current: readonly number[] | null };
  setActive: (index: number) => void;
  setDragging: (next: boolean) => void;
  setIndicatorPosition: (
    updater: (prev: Array<number | undefined>) => Array<number | undefined>,
  ) => void;
  setLabelId: (id: string | undefined) => void;
  /**
   * Applies a new value through `onValueChange` for keyboard, input, track-press,
   * and drag interactions. Returns `true` when the value was applied, or `false`
   * when it was invalid (NaN), unchanged, or the change was canceled.
   */
  setValue: (newValue: number | number[], details?: SliderRoot.ChangeEventDetails) => boolean;
  state: SliderRootState;
  /**
   * The step increment of the slider when incrementing or decrementing. It will snap
   * to multiples of this value. Decimal values are supported.
   * @default 1
   */
  step: Accessor<number>;
  thumbCollisionBehavior: Accessor<ThumbCollisionBehavior>;
  thumbMap: Accessor<Map<Element, CompositeMetadata<ThumbMetadata> | null>>;
  /**
   * The (mutable) list of thumb elements, ordered by index.
   */
  thumbElements: Array<HTMLElement | null>;
  /**
   * The value(s) of the slider
   */
  values: Accessor<readonly number[]>;
}

export const SliderRootContext = createContext<SliderRootContextValue | undefined>(undefined);

export function useSliderRootContext() {
  const context = useContext(SliderRootContext);
  if (context === undefined) {
    throw new Error(
      'Base UI Solid: SliderRootContext is missing. Slider parts must be placed within <Slider.Root>.',
    );
  }
  return context;
}
