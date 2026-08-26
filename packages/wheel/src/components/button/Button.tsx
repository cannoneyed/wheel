/* eslint-disable wheel/require-export-jsdoc -- Public guidance lives on the component and its stateful props; repeated alias comments hide that contract. */
import { createSignal, Show, splitProps, type Accessor, type JSX } from 'solid-js';
import { CompositeItem } from '../internals/composite/item/CompositeItem';
import type { StateAttributesMapping } from '../internals/getStateAttributesProps';
import { renderElement } from '../internals/renderElement';
import type { BaseUIComponentProps, HTMLProps, NativeButtonProps } from '../internals/types';
import { createButton } from '../internals/use-button/createButton';
import { useButtonGroupContext } from '../button-group/ButtonGroupContext';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonRenderOptions {
  defaultClass: string;
  slot: string;
  iconOnly?: boolean | undefined;
  icon?: Accessor<JSX.Element> | undefined;
  label?: Accessor<string> | undefined;
}

const stateAttributesMapping: StateAttributesMapping<ButtonState> = {
  iconOnly(value) {
    return value ? { 'data-icon-only': '' } : null;
  },
};

/**
 * Starts an action, submits a form, or follows a link with button styling.
 * Renders a `<button>` by default and an `<a>` when `href` is set.
 *
 * Behavior contract: `packages/wheel/src/components/button/button.spec.md`.
 */
export function Button(componentProps: Button.Props): JSX.Element {
  return renderButton(componentProps, {
    defaultClass: 'wheel-Button',
    slot: 'button',
  });
}

/** Shared renderer used by IconButton without adding a wrapper element. @internal */
export function renderButton(
  componentProps: Button.Props,
  options: ButtonRenderOptions,
): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'disabled',
    'focusableWhenDisabled',
    'nativeButton',
    'variant',
    'size',
    'loading',
    'interruptible',
    'clickAction',
    'icon',
    'endContent',
    'href',
  ]);

  const group = useButtonGroupContext();
  const [actionPending, setActionPending] = createSignal(false);
  let latestAction = 0;
  let actionInFlight = false;

  const variant = (): ButtonVariant => local.variant ?? group?.variant() ?? 'secondary';
  const size = (): ButtonSize => local.size ?? group?.size() ?? 'md';
  const loading = () => (local.loading ?? false) || actionPending();
  const interruptible = () => local.interruptible ?? false;
  const disabled = () =>
    (local.disabled ?? false) ||
    (group?.disabled() ?? false) ||
    (local.loading ?? false) ||
    (actionPending() && !interruptible());
  const nativeButton = () => local.nativeButton ?? local.href === undefined;
  const iconOnly = () => options.iconOnly ?? false;

  const finishAction = (actionId: number) => {
    if (actionId === latestAction) {
      actionInFlight = false;
      setActionPending(false);
    }
  };

  const runClickAction = (event: MouseEvent) => {
    if (!local.clickAction || event.defaultPrevented) {
      return;
    }
    if (actionInFlight && !interruptible()) {
      event.preventDefault();
      return;
    }

    const actionId = ++latestAction;
    actionInFlight = true;
    setActionPending(true);

    let result: void | Promise<void>;
    try {
      result = local.clickAction(event);
    } catch (error) {
      finishAction(actionId);
      throw error;
    }

    if (result && typeof result.then === 'function') {
      void result.then(
        () => finishAction(actionId),
        (error) => {
          finishAction(actionId);
          throw error;
        },
      );
    } else {
      finishAction(actionId);
    }
  };

  const { getButtonProps, buttonRef } = createButton({
    disabled,
    focusableWhenDisabled: () => local.focusableWhenDisabled,
    native: nativeButton,
  });

  const state: Button.State = {
    get disabled() {
      return disabled();
    },
    get loading() {
      return loading();
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

  const defaultProps = (): HTMLProps => ({
    'aria-busy': loading() || undefined,
    'aria-label': options.label?.(),
    href: disabled() ? undefined : local.href,
    onClick: runClickAction,
    ...(local.href !== undefined && !disabled() ? { role: undefined } : {}),
  });

  const props = [defaultProps, elementProps as HTMLProps, getButtonProps];
  const renderedChildren = () => {
    if (local.asChild) {
      return local.children as JSX.Element;
    }

    const leadingIcon = options.icon?.() ?? local.icon;
    return (
      <>
        <span class="wheel-Button-content">
          <Show when={leadingIcon !== undefined}>
            <span class="wheel-Button-icon" aria-hidden="true">
              {leadingIcon}
            </span>
          </Show>
          <Show when={!iconOnly()}>
            <span class="wheel-Button-label">{local.children as JSX.Element}</span>
            <Show when={local.endContent !== undefined}>
              <span class="wheel-Button-endContent" aria-hidden="true">
                {local.endContent}
              </span>
            </Show>
          </Show>
        </span>
        <Show when={loading()}>
          <span class="wheel-Button-spinner" aria-hidden="true" />
          <span class="wheel-Button-status" role="status" aria-live="polite">
            Loading
          </span>
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
        tag={local.href === undefined ? 'button' : 'a'}
        as={local.as}
        asChild={local.asChild}
        class={local.class}
        style={local.style}
        metadata={itemMetadata}
        state={state}
        refs={[buttonRef]}
        props={props}
        defaultClass={options.defaultClass}
        slot={options.slot}
        stateAttributesMapping={stateAttributesMapping}
      >
        {renderedChildren()}
      </CompositeItem>
    );
  }

  return renderElement(() => (local.href === undefined ? 'button' : 'a'), componentProps, {
    defaultClass: options.defaultClass,
    slot: options.slot,
    state,
    ref: buttonRef,
    props,
    children: local.asChild ? undefined : renderedChildren,
    stateAttributesMapping,
  });
}

export interface ButtonState {
  /** Whether the button ignores user interaction. */
  disabled: boolean;
  /** Whether controlled or action-driven work is pending. */
  loading: boolean;
  /** The resolved visual treatment. */
  variant: ButtonVariant;
  /** The resolved control size. */
  size: ButtonSize;
  /** Whether the visible content contains only an icon. */
  iconOnly: boolean;
}

export interface ButtonProps
  extends NativeButtonProps,
    BaseUIComponentProps<'button', ButtonState> {
  /** Visual emphasis. @default 'secondary' */
  variant?: ButtonVariant | undefined;
  /** Dense control size. @default 'md' */
  size?: ButtonSize | undefined;
  /** Whether the button should ignore user interaction. @default false */
  disabled?: boolean | undefined;
  /** Whether a controlled action is pending. @default false */
  loading?: boolean | undefined;
  /** Whether a pending `clickAction` accepts another activation. @default false */
  interruptible?: boolean | undefined;
  /** Runs after `onClick` unless that handler prevents the default action. */
  clickAction?: ((event: MouseEvent) => void | Promise<void>) | undefined;
  /** Content rendered before the label. */
  icon?: JSX.Element;
  /** Content rendered after the label. */
  endContent?: JSX.Element;
  /** Renders an anchor by default and supplies its destination. */
  href?: string | undefined;
  /** Native anchor browsing context when `href` is set. */
  target?: string | undefined;
  /** Native anchor relationship tokens when `href` is set. */
  rel?: string | undefined;
  /** Native anchor download behavior when `href` is set. */
  download?: string | boolean | undefined;
  /** Whether a disabled button remains in the tab order. @default false */
  focusableWhenDisabled?: boolean | undefined;
}

export namespace Button {
  export type State = ButtonState;
  export type Props = ButtonProps;
}
