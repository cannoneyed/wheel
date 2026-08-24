/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createEffect, type Accessor } from 'solid-js';
import { isHTMLElement } from '@floating-ui/utils/dom';
import { error } from '../../base-utils/error';
import { makeEventPreventable, mergeProps } from '../../merge-props/mergeProps';
import { useCompositeRootContext } from '../composite/root/CompositeRootContext';
import type { BaseUIEvent, HTMLProps } from '../types';
import { createFocusableWhenDisabled } from '../../utils/createFocusableWhenDisabled';

export interface CreateButtonParameters {
  /**
   * Whether the component should ignore user interaction.
   * @default false
   */
  disabled?: Accessor<boolean> | undefined;
  /**
   * Whether the button may receive focus even if it is disabled.
   * @default false
   */
  focusableWhenDisabled?: Accessor<boolean | undefined> | undefined;
  tabIndex?: Accessor<number | undefined> | undefined;
  /**
   * Whether the component is being rendered as a native button.
   * @default true
   */
  native?: Accessor<boolean | undefined> | undefined;
  /**
   * Whether the button is part of a composite widget.
   * When `true`, keyboard activation for Space occurs on keydown rather than keyup.
   * @default inferred from CompositeRoot context
   */
  composite?: Accessor<boolean | undefined> | undefined;
}

export interface CreateButtonReturnValue {
  /**
   * Resolver for the button props. Call inside a `renderElement` props thunk
   * so the result stays reactive.
   * @param externalProps additional props for the button
   * @returns props that should be spread on the button
   */
  getButtonProps: (externalProps: HTMLProps) => HTMLProps;
  /**
   * A ref for the button DOM element. Pass it in `renderElement`'s `ref`.
   */
  buttonRef: (element: HTMLElement) => void;
}

/**
 * Solid port of upstream's `useButton`: button semantics and keyboard
 * activation for native and non-native button elements.
 */
export function createButton(parameters: CreateButtonParameters = {}): CreateButtonReturnValue {
  const disabled = () => parameters.disabled?.() ?? false;
  const isNativeButton = () => parameters.native?.() ?? true;
  const tabIndex = () => parameters.tabIndex?.() ?? 0;

  let element: HTMLElement | null = null;

  const compositeRootContext = useCompositeRootContext(true);
  const isCompositeItem = () => parameters.composite?.() ?? compositeRootContext !== undefined;

  const { props: focusableWhenDisabledProps } = createFocusableWhenDisabled({
    focusableWhenDisabled: () => parameters.focusableWhenDisabled?.(),
    disabled,
    composite: isCompositeItem,
    tabIndex,
    isNativeButton,
  });

  if (process.env.NODE_ENV !== 'production') {
    createEffect(() => {
      if (!element) {
        return;
      }

      const isButtonTag = isButtonElement(element);

      if (isNativeButton()) {
        if (!isButtonTag) {
          error(
            'A component that acts as a button expected a native <button> because the ' +
              '`nativeButton` prop is true. Rendering a non-<button> removes native button ' +
              'semantics, which can impact forms and accessibility. Use a real <button> via ' +
              '`as`/`asChild`, or set `nativeButton` to `false`.',
          );
        }
      } else if (isButtonTag) {
        error(
          'A component that acts as a button expected a non-<button> because the `nativeButton` ' +
            'prop is false. Rendering a <button> keeps native behavior while Base UI applies ' +
            'non-native attributes and handlers, which can add unintended extra attributes (such ' +
            'as `role` or `aria-disabled`). Use a non-<button> via `as`/`asChild`, or set ' +
            '`nativeButton` to `true`.',
        );
      }
    });
  }

  // Handles a disabled composite button rendering another button, e.g.
  // <Toolbar.Button disabled asChild>{(p) => <Menu.Trigger {...p} />}</Toolbar.Button>
  // The `disabled` prop needs to pass through 2 `createButton`s then finally
  // delete the `disabled` attribute from the DOM.
  const updateDisabled = () => {
    if (!isButtonElement(element)) {
      return;
    }

    if (
      isCompositeItem() &&
      disabled() &&
      focusableWhenDisabledProps().disabled === undefined &&
      element.disabled
    ) {
      element.disabled = false;
    }
  };

  createEffect(updateDisabled);

  // NOTE: exactly one parameter, no default value — `renderElement` tells
  // props getters (length 1) apart from thunks (length 0) by arity.
  const getButtonProps = (externalPropsArg: GenericButtonProps): HTMLProps => {
    const externalProps = externalPropsArg ?? {};
    const {
      onClick: externalOnClick,
      onMouseDown: externalOnMouseDown,
      onKeyUp: externalOnKeyUp,
      onKeyDown: externalOnKeyDown,
      onPointerDown: externalOnPointerDown,
      ...otherExternalProps
    } = externalProps;

    return mergeProps(
      {
        onClick(event: MouseEvent) {
          if (disabled()) {
            event.preventDefault();
            return;
          }
          externalOnClick?.(event);
        },
        onMouseDown(event: MouseEvent) {
          if (!disabled()) {
            externalOnMouseDown?.(event);
          }
        },
        onKeyDown(event: BaseUIEvent<KeyboardEvent>) {
          if (disabled()) {
            return;
          }

          makeEventPreventable(event);
          externalOnKeyDown?.(event);
          if (event.baseUIHandlerPrevented) {
            return;
          }

          const isCurrentTarget = event.target === event.currentTarget;
          const currentTarget = event.currentTarget as HTMLElement;
          const isButton = isButtonElement(currentTarget);
          const isLink = !isNativeButton() && isValidLinkElement(currentTarget);
          const shouldClick = isCurrentTarget && (isNativeButton() ? isButton : !isLink);
          const isEnterKey = event.key === 'Enter';
          const isSpaceKey = event.key === ' ';
          const role = currentTarget.getAttribute('role');
          const isTextNavigationRole =
            role?.startsWith('menuitem') || role === 'option' || role === 'gridcell';

          if (isCurrentTarget && isCompositeItem() && isSpaceKey) {
            if (event.defaultPrevented && isTextNavigationRole) {
              return;
            }

            event.preventDefault();

            if (isLink || (isNativeButton() && isButton)) {
              currentTarget.click();
              event.preventBaseUIHandler();
            } else if (shouldClick) {
              externalOnClick?.(event);
              event.preventBaseUIHandler();
            }

            return;
          }

          // Keyboard accessibility for native and non-native elements.
          if (shouldClick) {
            if (!isNativeButton() && (isSpaceKey || isEnterKey)) {
              event.preventDefault();
            }

            if (!isNativeButton() && isEnterKey) {
              externalOnClick?.(event);
            }
          }
        },
        onKeyUp(event: BaseUIEvent<KeyboardEvent>) {
          if (disabled()) {
            return;
          }

          // Calling preventDefault in keyup on a <button> will not dispatch a
          // click event if Space is pressed.
          makeEventPreventable(event);
          externalOnKeyUp?.(event);

          if (
            event.target === event.currentTarget &&
            isNativeButton() &&
            isCompositeItem() &&
            isButtonElement(event.currentTarget as HTMLElement) &&
            event.key === ' '
          ) {
            event.preventDefault();
            return;
          }

          if (event.baseUIHandlerPrevented) {
            return;
          }

          // Keyboard accessibility for non-interactive elements.
          if (
            event.target === event.currentTarget &&
            !isNativeButton() &&
            !isCompositeItem() &&
            event.key === ' '
          ) {
            externalOnClick?.(event);
          }
        },
        onPointerDown(event: PointerEvent) {
          if (disabled()) {
            event.preventDefault();
            return;
          }
          externalOnPointerDown?.(event);
        },
      } as HTMLProps,
      isNativeButton() ? { type: 'button' } : { role: 'button' },
      focusableWhenDisabledProps() as HTMLProps,
      otherExternalProps,
    );
  };

  const buttonRef = (el: HTMLElement) => {
    element = el;
    updateDisabled();
  };

  return {
    getButtonProps,
    buttonRef,
  };
}

function isButtonElement(elem: HTMLElement | null): elem is HTMLButtonElement {
  return isHTMLElement(elem) && elem.tagName === 'BUTTON';
}

function isValidLinkElement(elem: HTMLElement | null): elem is HTMLAnchorElement {
  return Boolean(elem?.tagName === 'A' && (elem as HTMLAnchorElement)?.href);
}

interface GenericButtonProps extends Omit<HTMLProps, 'onClick'> {
  onClick?: ((event: Event) => void) | undefined;
}
