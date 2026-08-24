/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createEffect, splitProps } from 'solid-js';
import { createControllableSignal } from '../base-utils/createControllableSignal';
import { error } from '../base-utils/error';
import { createBaseUiId } from '../internals/createBaseUiId';
import { renderElement } from '../internals/renderElement';
import type { BaseUIComponentProps, NativeButtonProps } from '../internals/types';
import { useToggleGroupContext } from '../toggle-group/ToggleGroupContext';
import { createButton } from '../internals/use-button/createButton';
import { CompositeItem } from '../internals/composite/item/CompositeItem';
import {
  type BaseUIChangeEventDetails,
  createChangeEventDetails,
} from '../internals/createBaseUIEventDetails';
import { REASONS } from '../internals/reasons';

/**
 * A two-state button that can be on or off.
 * Renders a `<button>` element.
 *
 * Documentation: [Base UI Toggle](https://base-ui.com/react/components/toggle)
 */
export function Toggle<Value extends string>(componentProps: Toggle.Props<Value>) {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'defaultPressed',
    'disabled',
    'form', // never participates in form validation
    'onPressedChange',
    'pressed',
    'type', // cannot change button type
    'value',
    'nativeButton',
  ]);

  // `|| undefined` handles cases where value is falsy (i.e. "")
  const value = createBaseUiId(() => componentProps.value || undefined);
  const groupContext = useToggleGroupContext<string>();
  const groupValue = () => groupContext?.value() ?? [];

  const disabled = () =>
    (componentProps.disabled || groupContext?.disabled()) ?? false;

  if (process.env.NODE_ENV !== 'production') {
    createEffect(() => {
      if (groupContext && componentProps.value === undefined && groupContext.isValueInitialized()) {
        error(
          'A `<Toggle>` component rendered in a `<ToggleGroup>` has no explicit `value` prop.',
          'This will cause issues between the Toggle Group and Toggle values.',
          'Provide the `<Toggle>` with a `value` prop matching the `<ToggleGroup>` values prop type.',
        );
      }
    });
  }

  const [pressed, setPressedState] = createControllableSignal({
    controlled: () => {
      if (groupContext) {
        const v = value();
        return v !== undefined && groupValue().indexOf(v) > -1;
      }
      return componentProps.pressed;
    },
    default: (groupContext ? undefined : (componentProps.defaultPressed ?? false)) as boolean,
    name: 'Toggle',
    state: 'pressed',
  });

  const { getButtonProps, buttonRef } = createButton({
    disabled,
    native: () => componentProps.nativeButton ?? true,
  });

  const state: Toggle.State = {
    get disabled() {
      return disabled();
    },
    get pressed() {
      return pressed();
    },
  };

  const defaultProps = () => ({
    'aria-pressed': pressed(),
    onClick(event: MouseEvent) {
      const nextPressed = !pressed();
      const details = createChangeEventDetails(REASONS.none, event);

      // `onPressedChange` runs before the group commits so that canceling here
      // can also veto the group value change, which shares this `details` object.
      componentProps.onPressedChange?.(nextPressed, details);

      if (details.isCanceled) {
        return;
      }

      const v = value();
      if (v) {
        groupContext?.setGroupValue?.(v, nextPressed, details);
      }

      if (details.isCanceled) {
        return;
      }

      setPressedState(nextPressed);
    },
  });

  const props = [defaultProps, elementProps as Record<string, any>, getButtonProps];

  // A disabled toggle is natively disabled and cannot hold roving focus.
  // (Kept for parity with upstream; there is no Toolbar port yet to consume
  // this metadata, but a future one can without touching this component.)
  const itemMetadata = {
    get disabled() {
      return disabled();
    },
    focusableWhenDisabled: false,
  };

  // Group membership is fixed at setup time (the context can't appear later),
  // so a plain `if` here is a stable choice between two render paths, not a
  // reactive conditional — matching upstream's structure.
  if (groupContext) {
    return (
      <CompositeItem
        tag="button"
        as={componentProps.as}
        asChild={componentProps.asChild}
        class={componentProps.class}
        style={componentProps.style}
        metadata={itemMetadata}
        state={state}
        refs={[buttonRef]}
        props={props}
      >
        {componentProps.children}
      </CompositeItem>
    );
  }

  return renderElement('button', componentProps, {
    defaultClass: 'wheel-Toggle',
    slot: 'toggle',
    state,
    ref: buttonRef,
    props,
  });
}

export interface ToggleState {
  /**
   * Whether the toggle is currently pressed.
   */
  pressed: boolean;
  /**
   * Whether the toggle should ignore user interaction.
   */
  disabled: boolean;
}

export interface ToggleProps<Value extends string>
  extends NativeButtonProps,
    BaseUIComponentProps<'button', ToggleState> {
  /**
   * Whether the toggle button is currently pressed.
   * This is the controlled counterpart of `defaultPressed`.
   */
  pressed?: boolean | undefined;
  /**
   * Whether the toggle button is currently pressed.
   * This is the uncontrolled counterpart of `pressed`.
   * @default false
   */
  defaultPressed?: boolean | undefined;
  /**
   * Whether the component should ignore user interaction.
   * @default false
   */
  disabled?: boolean | undefined;
  /**
   * Callback fired when the pressed state is changed.
   */
  onPressedChange?:
    | ((pressed: boolean, eventDetails: Toggle.ChangeEventDetails) => void)
    | undefined;
  /**
   * A unique string that identifies the toggle when used
   * inside a toggle group.
   */
  value?: Value | undefined;
}

export type ToggleChangeEventReason = typeof REASONS.none;

export type ToggleChangeEventDetails = BaseUIChangeEventDetails<Toggle.ChangeEventReason>;

export namespace Toggle {
  export type State = ToggleState;
  export type Props<TValue extends string = string> = ToggleProps<TValue>;
  export type ChangeEventReason = ToggleChangeEventReason;
  export type ChangeEventDetails = ToggleChangeEventDetails;
}
