/* eslint-disable wheel/require-export-jsdoc -- Public guidance lives on the component and its stateful props; repeated alias comments hide that contract. */
/* eslint-disable wheel/require-effect-reason -- The effect reports a group value mismatch at the point where it becomes observable. */
/* eslint-disable wheel/require-view-root -- Toggle is a library primitive; the consuming application owns the view boundary. */
import { createEffect, Show, splitProps, type JSX } from 'solid-js';
import type { ButtonSize, ButtonVariant } from '../button/Button';
import { createControllableSignal } from '../base-utils/createControllableSignal';
import { error } from '../base-utils/error';
import { createBaseUiId } from '../internals/createBaseUiId';
import {
  type BaseUIChangeEventDetails,
  createChangeEventDetails,
} from '../internals/createBaseUIEventDetails';
import { CompositeItem } from '../internals/composite/item/CompositeItem';
import type { StateAttributesMapping } from '../internals/getStateAttributesProps';
import { REASONS } from '../internals/reasons';
import { renderElement } from '../internals/renderElement';
import type { BaseUIComponentProps, HTMLProps, NativeButtonProps } from '../internals/types';
import { createButton } from '../internals/use-button/createButton';
import { useToggleGroupContext } from '../toggle-group/ToggleGroupContext';

const stateAttributesMapping: StateAttributesMapping<ToggleState> = {
  iconOnly(value) {
    return value ? { 'data-icon-only': '' } : null;
  },
};

/**
 * A two-state button for pressed tools and temporary choices.
 *
 * Behavior contract: `packages/wheel/src/components/toggle/toggle.spec.md`.
 */
export function Toggle<Value extends string>(componentProps: Toggle.Props<Value>): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'defaultPressed',
    'disabled',
    'form',
    'onPressedChange',
    'pressed',
    'type',
    'value',
    'nativeButton',
    'label',
    'icon',
    'pressedIcon',
    'variant',
    'size',
  ]);

  const value = createBaseUiId(() => local.value || undefined);
  const group = useToggleGroupContext<string>();
  const groupValue = () => group?.value() ?? [];
  const disabled = () => (local.disabled || group?.disabled()) ?? false;
  const variant = (): ButtonVariant => local.variant ?? group?.variant() ?? 'ghost';
  const size = (): ButtonSize => local.size ?? group?.size() ?? 'md';
  const iconOnly = () =>
    local.icon !== undefined && local.children === undefined && local.label !== undefined;

  if (process.env.NODE_ENV !== 'production') {
    createEffect(() => {
      if (group && local.value === undefined && group.isValueInitialized()) {
        error(
          'A <Toggle> rendered in <ToggleGroup> has no explicit value.',
          'Provide a unique value matching the ToggleGroup value type.',
        );
      }
    });
  }

  const [pressed, setPressedState] = createControllableSignal({
    controlled: () => {
      if (group) {
        const itemValue = value();
        return itemValue !== undefined && groupValue().indexOf(itemValue) > -1;
      }
      return local.pressed;
    },
    default: (group ? undefined : (local.defaultPressed ?? false)) as boolean,
    name: 'Toggle',
    state: 'pressed',
  });

  const { getButtonProps, buttonRef } = createButton({
    disabled,
    native: () => local.nativeButton ?? true,
  });

  const state: Toggle.State = {
    get disabled() {
      return disabled();
    },
    get pressed() {
      return pressed();
    },
    get variant() {
      return variant();
    },
    get size() {
      return size();
    },
    get iconOnly() {
      return iconOnly();
    },
  };

  const defaultProps = () => ({
    'aria-label': iconOnly() ? local.label : undefined,
    'aria-pressed': pressed(),
    onClick(event: MouseEvent) {
      const nextPressed = !pressed();
      const details = createChangeEventDetails(REASONS.none, event);
      local.onPressedChange?.(nextPressed, details);

      if (details.isCanceled) {
        return;
      }

      const itemValue = value();
      if (itemValue) {
        group?.setGroupValue?.(itemValue, nextPressed, details);
      }

      if (!details.isCanceled) {
        setPressedState(nextPressed);
      }
    },
  });

  const props = [defaultProps, elementProps as HTMLProps, getButtonProps];
  const renderedChildren = () => {
    if (local.asChild) {
      return local.children as JSX.Element;
    }
    const resolvedIcon = pressed() && local.pressedIcon !== undefined
      ? local.pressedIcon
      : local.icon;
    const visibleLabel = local.children ?? local.label;

    return (
      <>
        <Show when={resolvedIcon !== undefined}>
          <span class="wheel-Toggle-icon" aria-hidden="true">
            {resolvedIcon}
          </span>
        </Show>
        <Show when={!iconOnly() && visibleLabel !== undefined}>
          <span class="wheel-Toggle-label">{visibleLabel as JSX.Element}</span>
        </Show>
      </>
    );
  };

  const itemMetadata = {
    get disabled() {
      return disabled();
    },
    focusableWhenDisabled: false,
  };

  if (group) {
    return (
      <CompositeItem
        tag="button"
        as={local.as}
        asChild={local.asChild}
        class={local.class}
        style={local.style}
        metadata={itemMetadata}
        state={state}
        refs={[buttonRef]}
        props={props}
        defaultClass="wheel-Toggle"
        slot="toggle"
        stateAttributesMapping={stateAttributesMapping}
      >
        {renderedChildren()}
      </CompositeItem>
    );
  }

  return renderElement('button', componentProps, {
    defaultClass: 'wheel-Toggle',
    slot: 'toggle',
    state,
    ref: buttonRef,
    props,
    children: local.asChild ? undefined : renderedChildren,
    stateAttributesMapping,
  });
}

export interface ToggleState {
  /** Whether the Toggle is pressed. */
  pressed: boolean;
  /** Whether the Toggle ignores user interaction. */
  disabled: boolean;
  /** The resolved selected treatment. */
  variant: ButtonVariant;
  /** The resolved control size. */
  size: ButtonSize;
  /** Whether the Toggle contains only an icon. */
  iconOnly: boolean;
}

export interface ToggleProps<Value extends string>
  extends NativeButtonProps,
    BaseUIComponentProps<'button', ToggleState> {
  /** Controlled pressed state. */
  pressed?: boolean | undefined;
  /** Initial uncontrolled pressed state. @default false */
  defaultPressed?: boolean | undefined;
  /** Whether the Toggle ignores user interaction. @default false */
  disabled?: boolean | undefined;
  /** Requests a pressed state change. */
  onPressedChange?:
    | ((pressed: boolean, eventDetails: Toggle.ChangeEventDetails) => void)
    | undefined;
  /** Unique value when used inside ToggleGroup. */
  value?: Value | undefined;
  /** Visible label, or the accessible name for an icon-only Toggle. */
  label?: string | undefined;
  /** Icon rendered before the visible label. */
  icon?: JSX.Element;
  /** Icon rendered instead of `icon` while pressed. */
  pressedIcon?: JSX.Element;
  /** Selected visual treatment. @default 'ghost' */
  variant?: ButtonVariant | undefined;
  /** Dense control size. @default 'md' */
  size?: ButtonSize | undefined;
}

export type ToggleChangeEventReason = typeof REASONS.none;
export type ToggleChangeEventDetails = BaseUIChangeEventDetails<Toggle.ChangeEventReason>;

export namespace Toggle {
  export type State = ToggleState;
  export type Props<TValue extends string = string> = ToggleProps<TValue>;
  export type ChangeEventReason = ToggleChangeEventReason;
  export type ChangeEventDetails = ToggleChangeEventDetails;
}
