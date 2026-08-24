/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createEffect, splitProps, type JSX } from 'solid-js';
import { warn } from '../../base-utils/warn';
import { createControllableSignal } from '../../base-utils/createControllableSignal';
import { renderElement } from '../../internals/renderElement';
import type { BaseUIComponentProps, Orientation } from '../../internals/types';
import { CompositeList } from '../../internals/composite/list/CompositeList';
import { AccordionRootContext } from './AccordionRootContext';
import { type BaseUIChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';

const rootStateAttributesMapping = {
  value: () => null,
};

/**
 * Groups all parts of the accordion.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Accordion](https://base-ui.com/react/components/accordion)
 */
export function AccordionRoot<Value = any>(componentProps: AccordionRoot.Props<Value>): JSX.Element {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'disabled',
    'hiddenUntilFound',
    'keepMounted',
    'loopFocus',
    'onValueChange',
    'multiple',
    'orientation',
    'value',
    'defaultValue',
  ]);

  if (process.env.NODE_ENV !== 'production') {
    createEffect(() => {
      if (componentProps.hiddenUntilFound && componentProps.keepMounted === false) {
        warn(
          'The `keepMounted={false}` prop on `Accordion.Root` is ignored when `hiddenUntilFound` is enabled, since panels must remain mounted while closed.',
        );
      }
    });
  }

  const disabled = () => componentProps.disabled ?? false;
  const multiple = () => componentProps.multiple ?? false;
  const orientation = () => componentProps.orientation ?? 'vertical';
  const hiddenUntilFound = () => componentProps.hiddenUntilFound ?? false;
  const keepMounted = () => componentProps.keepMounted ?? false;

  // Read once at setup, matching upstream's memoized default (omit both
  // `defaultValue` and `value` to avoid a controlled/uncontrolled warning).
  const initialDefaultValue: AccordionValue<Value> =
    componentProps.value === undefined ? (componentProps.defaultValue ?? []) : ([] as any);

  const [value, setValue] = createControllableSignal<AccordionValue<Value>>({
    controlled: () => componentProps.value,
    default: initialDefaultValue,
    name: 'Accordion',
    state: 'value',
  });

  const handleValueChange = (
    newValue: AccordionValue<Value>[number],
    nextOpen: boolean,
    eventDetails: AccordionRoot.ChangeEventDetails,
  ) => {
    if (!multiple()) {
      const nextValue = value()[0] === newValue ? [] : [newValue];
      componentProps.onValueChange?.(nextValue, eventDetails);
      if (eventDetails.isCanceled) {
        return;
      }
      setValue(nextValue);
    } else if (nextOpen) {
      const nextOpenValues = value().slice();
      nextOpenValues.push(newValue);
      componentProps.onValueChange?.(nextOpenValues, eventDetails);
      if (eventDetails.isCanceled) {
        return;
      }
      setValue(nextOpenValues);
    } else {
      const nextOpenValues = value().filter((v) => v !== newValue);
      componentProps.onValueChange?.(nextOpenValues, eventDetails);
      if (eventDetails.isCanceled) {
        return;
      }
      setValue(nextOpenValues);
    }
  };

  const state: AccordionRoot.State<Value> = {
    get value() {
      return value();
    },
    get disabled() {
      return disabled();
    },
    get orientation() {
      return orientation();
    },
  };

  const contextValue: AccordionRootContext<Value> = {
    disabled,
    handleValueChange,
    hiddenUntilFound,
    keepMounted,
    state,
    value,
  };

  const elements: Array<HTMLElement | null> = [];

  return (
    <AccordionRootContext.Provider value={contextValue}>
      <CompositeList elements={elements}>
        {renderElement('div', componentProps, {
          defaultClass: 'wheel-Accordion-Root',
          slot: 'accordion-root',
          state,
          props: [elementProps as Record<string, any>],
          stateAttributesMapping: rootStateAttributesMapping,
        })}
      </CompositeList>
    </AccordionRootContext.Provider>
  );
}

export type AccordionValue<Value = any> = Value[];

export interface AccordionRootState<Value = any> {
  /**
   * The current value.
   */
  value: AccordionValue<Value>;
  /**
   * Whether the component should ignore user interaction.
   */
  disabled: boolean;
  /**
   * The component orientation.
   *
   * Deprecated following the [APG guidance update](https://github.com/w3c/aria-practices/pull/3434)
   * to remove roving focus.
   *
   * This state no longer affects keyboard focus behavior.
   * @deprecated
   */
  orientation: Orientation;
}

export interface AccordionRootProps<Value = any>
  extends BaseUIComponentProps<'div', AccordionRootState<Value>> {
  /**
   * The controlled value of the item(s) that should be expanded.
   *
   * To render an uncontrolled accordion, use the `defaultValue` prop instead.
   */
  value?: AccordionValue<Value> | undefined;
  /**
   * The uncontrolled value of the item(s) that should be initially expanded.
   *
   * To render a controlled accordion, use the `value` prop instead.
   */
  defaultValue?: AccordionValue<Value> | undefined;
  /**
   * Whether the component should ignore user interaction.
   * @default false
   */
  disabled?: boolean | undefined;
  /**
   * Allows the browser's built-in page search to find and expand the panel contents.
   *
   * Overrides the `keepMounted` prop and uses `hidden="until-found"`
   * to hide the element without removing it from the DOM.
   * @default false
   */
  hiddenUntilFound?: boolean | undefined;
  /**
   * Whether to keep the element in the DOM while the panel is closed.
   * This prop is ignored when `hiddenUntilFound` is used.
   * @default false
   */
  keepMounted?: boolean | undefined;
  /**
   * Deprecated following the [APG guidance update](https://github.com/w3c/aria-practices/pull/3434)
   * to remove roving focus.
   *
   * This prop no longer affects keyboard focus behavior.
   * @deprecated
   */
  loopFocus?: boolean | undefined;
  /**
   * Event handler called when an accordion item is expanded or collapsed.
   * Provides the new value as an argument.
   */
  onValueChange?:
    | ((value: AccordionValue<Value>, eventDetails: AccordionRootChangeEventDetails) => void)
    | undefined;
  /**
   * Whether multiple items can be open at the same time.
   * @default false
   */
  multiple?: boolean | undefined;
  /**
   * Deprecated following the [APG guidance update](https://github.com/w3c/aria-practices/pull/3434)
   * to remove roving focus.
   *
   * This prop no longer affects keyboard focus behavior.
   * @default 'vertical'
   * @deprecated
   */
  orientation?: Orientation | undefined;
}

export type AccordionRootChangeEventReason = typeof REASONS.triggerPress | typeof REASONS.none;

export type AccordionRootChangeEventDetails =
  BaseUIChangeEventDetails<AccordionRootChangeEventReason>;

export namespace AccordionRoot {
  export type Value<TValue = any> = AccordionValue<TValue>;
  export type State<TValue = any> = AccordionRootState<TValue>;
  export type Props<TValue = any> = AccordionRootProps<TValue>;
  export type ChangeEventReason = AccordionRootChangeEventReason;
  export type ChangeEventDetails = AccordionRootChangeEventDetails;
}
