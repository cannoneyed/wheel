/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createMemo, splitProps } from 'solid-js';
import { createControllableSignal } from '../base-utils/createControllableSignal';
import { EMPTY_ARRAY } from '../base-utils/empty';
import type { BaseUIComponentProps, HTMLProps, Orientation } from '../internals/types';
import { CompositeRoot } from '../internals/composite/root/CompositeRoot';
import { renderElement } from '../internals/renderElement';
import { useToolbarRootContext } from '../toolbar/root/ToolbarRootContext';
import { useToolbarGroupContext } from '../toolbar/group/ToolbarGroupContext';
import {
  ToggleGroupContext,
  type ToggleGroupContext as ToggleGroupContextType,
} from './ToggleGroupContext';
import { stateAttributesMapping } from './stateAttributesMapping';
import type { BaseUIChangeEventDetails } from '../internals/createBaseUIEventDetails';
import { REASONS } from '../internals/reasons';

/**
 * Provides a shared state to a series of toggle buttons.
 *
 * Documentation: [Base UI Toggle Group](https://base-ui.com/react/components/toggle-group)
 */
export function ToggleGroup<Value extends string>(componentProps: ToggleGroup.Props<Value>) {
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
    'multiple',
  ]);

  const isValueInitialized = createMemo(
    () => componentProps.value !== undefined || componentProps.defaultValue !== undefined,
  );

  const toolbarContext = useToolbarRootContext(true);
  const toolbarGroupContext = useToolbarGroupContext(true);

  const disabled = () =>
    (toolbarContext?.disabled() ?? false) ||
    (toolbarGroupContext?.disabled() ?? false) ||
    (componentProps.disabled ?? false);
  const orientation = (): Orientation => componentProps.orientation ?? 'horizontal';
  const multiple = () => componentProps.multiple ?? false;
  const loopFocus = () => componentProps.loopFocus ?? true;

  const [groupValue, setValueState] = createControllableSignal<readonly Value[]>({
    controlled: () => componentProps.value,
    default: (componentProps.defaultValue ?? (EMPTY_ARRAY as readonly Value[])) as readonly Value[],
    name: 'ToggleGroup',
    state: 'value',
  });

  const setGroupValue = (
    newValue: Value,
    nextPressed: boolean,
    eventDetails: BaseUIChangeEventDetails<typeof REASONS.none>,
  ) => {
    const currentValue = groupValue();
    let newGroupValue: Value[];
    if (multiple()) {
      newGroupValue = currentValue.slice();
      if (nextPressed) {
        newGroupValue.push(newValue);
      } else {
        newGroupValue.splice(currentValue.indexOf(newValue), 1);
      }
    } else {
      newGroupValue = nextPressed ? [newValue] : [];
    }

    componentProps.onValueChange?.(newGroupValue, eventDetails);

    if (eventDetails.isCanceled) {
      return;
    }

    setValueState(newGroupValue);
  };

  const state: ToggleGroup.State = {
    get disabled() {
      return disabled();
    },
    get multiple() {
      return multiple();
    },
    get orientation() {
      return orientation();
    },
  };

  const contextValue: ToggleGroupContextType<Value> = {
    value: groupValue,
    setGroupValue,
    disabled,
    orientation,
    isValueInitialized,
  };

  const defaultProps = { role: 'group' };

  // The context Provider must wrap the actual rendered element (created inside
  // `CompositeRoot`) so that descendants — the `Toggle`s that read
  // `ToggleGroupContext` while rendering — see the context.
  // Inside a Toolbar the group renders a plain element: the Toolbar itself is
  // the composite root, and a nested CompositeRoot would double-handle arrow keys.
  return (
    <ToggleGroupContext.Provider value={contextValue}>
      {toolbarContext ? (
        renderElement('div', componentProps, {
          defaultClass: 'wheel-ToggleGroup',
          slot: 'toggle-group',
          state,
          props: [defaultProps, elementProps as HTMLProps],
          stateAttributesMapping,
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
        props={[defaultProps, elementProps as HTMLProps]}
        stateAttributesMapping={stateAttributesMapping}
        loopFocus={loopFocus()}
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
  /**
   * Whether the component should ignore user interaction.
   */
  disabled: boolean;
  /**
   * When `false` only one item in the group can be pressed. If any item in
   * the group becomes pressed, the others will become unpressed.
   * When `true` multiple items can be pressed.
   * @default false
   */
  multiple: boolean;
  /**
   * The orientation of the toggle group.
   */
  orientation: Orientation;
}

export interface ToggleGroupProps<Value extends string>
  extends BaseUIComponentProps<'div', ToggleGroupState> {
  /**
   * The pressed state of the toggle group represented by an array of
   * the values of all pressed toggle buttons.
   * This is the controlled counterpart of `defaultValue`.
   */
  value?: readonly Value[] | undefined;
  /**
   * The pressed state of the toggle group represented by an array of
   * the values of all pressed toggle buttons.
   * This is the uncontrolled counterpart of `value`.
   */
  defaultValue?: readonly Value[] | undefined;
  /**
   * Callback fired when the pressed states of the toggle group changes.
   */
  onValueChange?:
    | ((groupValue: Value[], eventDetails: ToggleGroup.ChangeEventDetails) => void)
    | undefined;
  /**
   * Whether the toggle group should ignore user interaction.
   * @default false
   */
  disabled?: boolean | undefined;
  /**
   * @default 'horizontal'
   */
  orientation?: Orientation | undefined;
  /**
   * Whether to loop keyboard focus back to the first item
   * when the end of the list is reached while using the arrow keys.
   * @default true
   */
  loopFocus?: boolean | undefined;
  /**
   * When `false` only one item in the group can be pressed. If any item in
   * the group becomes pressed, the others will become unpressed.
   * When `true` multiple items can be pressed.
   * @default false
   */
  multiple?: boolean | undefined;
}

export type ToggleGroupChangeEventReason = typeof REASONS.none;

export type ToggleGroupChangeEventDetails = BaseUIChangeEventDetails<ToggleGroup.ChangeEventReason>;

export namespace ToggleGroup {
  export type State = ToggleGroupState;
  export type Props<Value extends string = string> = ToggleGroupProps<Value>;
  export type ChangeEventReason = ToggleGroupChangeEventReason;
  export type ChangeEventDetails = ToggleGroupChangeEventDetails;
}
