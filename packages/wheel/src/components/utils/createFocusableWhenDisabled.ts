/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import type { Accessor } from 'solid-js';

interface FocusableWhenDisabledProps {
  'aria-disabled'?: boolean | undefined;
  disabled?: boolean | undefined;
  onKeyDown: (event: KeyboardEvent) => void;
  tabIndex?: number;
}

export interface CreateFocusableWhenDisabledParameters {
  /**
   * Whether the component should be focusable when disabled.
   * When `undefined`, composite items are focusable when disabled by default.
   */
  focusableWhenDisabled: Accessor<boolean | undefined>;
  /**
   * The disabled state of the component.
   */
  disabled: Accessor<boolean>;
  /**
   * Whether this is a composite item or not.
   * @default false
   */
  composite?: Accessor<boolean>;
  /**
   * @default 0
   */
  tabIndex?: Accessor<number | undefined>;
  isNativeButton: Accessor<boolean>;
}

/**
 * Solid port of upstream's `useFocusableWhenDisabled`. Returns an accessor
 * producing the additional props; call it inside a reactive scope (e.g. a
 * `renderElement` props thunk).
 */
export function createFocusableWhenDisabled(parameters: CreateFocusableWhenDisabledParameters) {
  const props = (): FocusableWhenDisabledProps => {
    const disabled = parameters.disabled();
    const focusableWhenDisabled = parameters.focusableWhenDisabled();
    const composite = parameters.composite?.() ?? false;
    const tabIndexProp = parameters.tabIndex?.() ?? 0;
    const isNativeButton = parameters.isNativeButton();

    const isFocusableComposite = composite && focusableWhenDisabled !== false;
    const isNonFocusableComposite = composite && focusableWhenDisabled === false;

    // We can't explicitly assign `undefined` to any of these props because it
    // would otherwise prevent subsequently merged props from setting them.
    const additionalProps = {
      // Allow tabbing away from focusableWhenDisabled elements.
      onKeyDown(event: KeyboardEvent) {
        if (disabled && focusableWhenDisabled && event.key !== 'Tab') {
          event.preventDefault();
        }
      },
    } as FocusableWhenDisabledProps;

    if (!composite) {
      additionalProps.tabIndex = tabIndexProp;

      if (!isNativeButton && disabled) {
        additionalProps.tabIndex = focusableWhenDisabled ? tabIndexProp : -1;
      }
    }

    if (
      (isNativeButton && (focusableWhenDisabled || isFocusableComposite)) ||
      (!isNativeButton && disabled)
    ) {
      additionalProps['aria-disabled'] = disabled;
    }

    if (isNativeButton && (!focusableWhenDisabled || isNonFocusableComposite)) {
      additionalProps.disabled = disabled;
    }

    return additionalProps;
  };

  return { props };
}
