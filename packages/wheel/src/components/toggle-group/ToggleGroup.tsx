/* eslint-disable wheel/require-export-jsdoc -- Public guidance lives on the component and its stateful props; repeated alias comments hide that contract. */
import { createMemo, splitProps, type JSX } from 'solid-js';
import type { ButtonSize, ButtonVariant } from '../button/Button';
import { createControllableSignal } from '../base-utils/createControllableSignal';
import { EMPTY_ARRAY } from '../base-utils/empty';
import type { BaseUIChangeEventDetails } from '../internals/createBaseUIEventDetails';
import { CompositeRoot } from '../internals/composite/root/CompositeRoot';
import { REASONS } from '../internals/reasons';
import { renderElement } from '../internals/renderElement';
import type { BaseUIComponentProps, HTMLProps, Orientation } from '../internals/types';
import { useToolbarGroupContext } from '../toolbar/group/ToolbarGroupContext';
import { useToolbarRootContext } from '../toolbar/root/ToolbarRootContext';
import {
  ToggleGroupContext,
  type ToggleGroupContext as ToggleGroupContextValue,
} from './ToggleGroupContext';

export type ToggleGroupType = 'single' | 'multiple';
export type ToggleGroupLayout = 'hug' | 'fill';

/**
 * Coordinates typed single-select or multi-select Toggle values and roving focus.
 *
 * Behavior contract: `packages/wheel/src/components/toggle-group/toggle-group.spec.md`.
 */
export function ToggleGroup<Value extends string>(
  componentProps: ToggleGroup.Props<Value>,
): JSX.Element {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'value',
    'defaultValue',
    'onValueChange',
    'disabled',
    'orientation',
    'loopFocus',
    'type',
    'layout',
    'size',
    'variant',
  ]);

  const toolbarContext = useToolbarRootContext(true);
  const toolbarGroupContext = useToolbarGroupContext(true);
  const type = (): ToggleGroupType => componentProps.type ?? 'single';
  const layout = (): ToggleGroupLayout => componentProps.layout ?? 'hug';
  const size = (): ButtonSize => componentProps.size ?? 'md';
  const variant = (): ButtonVariant => componentProps.variant ?? 'secondary';
  const orientation = (): Orientation => componentProps.orientation ?? 'horizontal';
  const disabled = () =>
    (toolbarContext?.disabled() ?? false) ||
    (toolbarGroupContext?.disabled() ?? false) ||
    (componentProps.disabled ?? false);

  const toArray = (value: Value | null | readonly Value[] | undefined): readonly Value[] => {
    if (value == null) {
      return EMPTY_ARRAY as readonly Value[];
    }
    return Array.isArray(value) ? value : [value as Value];
  };

  const isValueInitialized = createMemo(
    () => componentProps.value !== undefined || componentProps.defaultValue !== undefined,
  );

  const [groupValue, setValueState] = createControllableSignal<readonly Value[]>({
    controlled: () =>
      componentProps.value === undefined ? undefined : toArray(componentProps.value),
    default: toArray(componentProps.defaultValue),
    name: 'ToggleGroup',
    state: 'value',
  });

  const setGroupValue = (
    itemValue: Value,
    nextPressed: boolean,
    eventDetails: BaseUIChangeEventDetails<typeof REASONS.none>,
  ) => {
    const current = groupValue();
    let next: Value[];

    if (type() === 'multiple') {
      next = current.slice();
      const currentIndex = current.indexOf(itemValue);
      if (nextPressed && currentIndex === -1) {
        next.push(itemValue);
      } else if (!nextPressed && currentIndex !== -1) {
        next.splice(currentIndex, 1);
      }
    } else {
      next = nextPressed ? [itemValue] : [];
    }

    const publicValue = type() === 'multiple' ? next : (next[0] ?? null);
    const onValueChange = componentProps.onValueChange as
      | ((
          value: Value | null | readonly Value[],
          details: ToggleGroup.ChangeEventDetails,
        ) => void)
      | undefined;
    onValueChange?.(publicValue, eventDetails);

    if (!eventDetails.isCanceled) {
      setValueState(next);
    }
  };

  const state: ToggleGroup.State = {
    get disabled() {
      return disabled();
    },
    get type() {
      return type();
    },
    get orientation() {
      return orientation();
    },
    get layout() {
      return layout();
    },
    get size() {
      return size();
    },
    get variant() {
      return variant();
    },
  };

  const contextValue: ToggleGroupContextValue<Value> = {
    value: groupValue,
    setGroupValue,
    disabled,
    orientation,
    size,
    variant,
    isValueInitialized,
  };

  return (
    <ToggleGroupContext.Provider value={contextValue}>
      {toolbarContext ? (
        renderElement('div', componentProps, {
          defaultClass: 'wheel-ToggleGroup',
          slot: 'toggle-group',
          state,
          props: [{ role: 'group' }, elementProps as HTMLProps],
        })
      ) : (
        <CompositeRoot
          tag="div"
          as={componentProps.as}
          asChild={componentProps.asChild}
          class={componentProps.class}
          style={componentProps.style}
          state={state}
          refs={componentProps.ref ? [componentProps.ref] : undefined}
          props={[{ role: 'group' }, elementProps as HTMLProps]}
          defaultClass="wheel-ToggleGroup"
          slot="toggle-group"
          loopFocus={componentProps.loopFocus ?? true}
          enableHomeAndEndKeys
          orientation={orientation()}
        >
          {componentProps.children}
        </CompositeRoot>
      )}
    </ToggleGroupContext.Provider>
  );
}

export interface ToggleGroupState {
  /** Whether every Toggle ignores user interaction. */
  disabled: boolean;
  /** The selection value shape. */
  type: ToggleGroupType;
  /** The layout and arrow-key direction. */
  orientation: Orientation;
  /** Whether the group hugs its contents or fills available width. */
  layout: ToggleGroupLayout;
  /** The size inherited by Toggle children. */
  size: ButtonSize;
  /** The selected treatment inherited by Toggle children. */
  variant: ButtonVariant;
}

interface ToggleGroupBaseProps extends BaseUIComponentProps<'div', ToggleGroupState> {
  /** Whether every Toggle ignores user interaction. @default false */
  disabled?: boolean | undefined;
  /** Layout and arrow-key direction. @default 'horizontal' */
  orientation?: Orientation | undefined;
  /** Whether the group hugs or fills available inline space. @default 'hug' */
  layout?: ToggleGroupLayout | undefined;
  /** Default Toggle size. @default 'md' */
  size?: ButtonSize | undefined;
  /** Default selected Toggle variant. @default 'secondary' */
  variant?: ButtonVariant | undefined;
  /** Whether arrow focus wraps at either end. @default true */
  loopFocus?: boolean | undefined;
}

export interface ToggleGroupSingleProps<Value extends string>
  extends ToggleGroupBaseProps {
  /** Single-select value mode. @default 'single' */
  type?: 'single' | undefined;
  /** Controlled selected value. */
  value?: Value | null | undefined;
  /** Initial uncontrolled selected value. */
  defaultValue?: Value | null | undefined;
  /** Requests a selected value change. */
  onValueChange?:
    | ((value: Value | null, eventDetails: ToggleGroup.ChangeEventDetails) => void)
    | undefined;
}

export interface ToggleGroupMultipleProps<Value extends string>
  extends ToggleGroupBaseProps {
  /** Multi-select value mode. */
  type: 'multiple';
  /** Controlled selected values. */
  value?: readonly Value[] | undefined;
  /** Initial uncontrolled selected values. */
  defaultValue?: readonly Value[] | undefined;
  /** Requests a selected values change. */
  onValueChange?:
    | ((value: Value[], eventDetails: ToggleGroup.ChangeEventDetails) => void)
    | undefined;
}

export type ToggleGroupProps<Value extends string> =
  | ToggleGroupSingleProps<Value>
  | ToggleGroupMultipleProps<Value>;

export type ToggleGroupChangeEventReason = typeof REASONS.none;
export type ToggleGroupChangeEventDetails =
  BaseUIChangeEventDetails<ToggleGroup.ChangeEventReason>;

export namespace ToggleGroup {
  export type State = ToggleGroupState;
  export type Props<Value extends string = string> = ToggleGroupProps<Value>;
  export type ChangeEventReason = ToggleGroupChangeEventReason;
  export type ChangeEventDetails = ToggleGroupChangeEventDetails;
}
