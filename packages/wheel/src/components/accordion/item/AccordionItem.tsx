/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { useSignal } from '../../../core/local-state';
import { splitProps, type JSX } from 'solid-js';
import { renderElement } from '../../internals/renderElement';
import type { BaseUIComponentProps } from '../../internals/types';
import { createBaseUiId } from '../../internals/createBaseUiId';
import { createCollapsibleRoot } from '../../collapsible/root/createCollapsibleRoot';
import { CollapsibleRootContext } from '../../collapsible/root/CollapsibleRootContext';
import type { CollapsibleRoot, CollapsibleRootState } from '../../collapsible/root/CollapsibleRoot';
import { createCompositeListItem } from '../../internals/composite/list/createCompositeListItem';
import type { AccordionRootState } from '../root/AccordionRoot';
import { useAccordionRootContext } from '../root/AccordionRootContext';
import { AccordionItemContext } from './AccordionItemContext';
import { accordionStateAttributesMapping } from './stateAttributesMapping';
import { type BaseUIChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';

/**
 * Groups an accordion header with the corresponding panel.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Accordion](https://base-ui.com/react/components/accordion)
 */
export function AccordionItem(componentProps: AccordionItem.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'disabled',
    'onOpenChange',
    'value',
  ]);

  const { ref: listItemRef, index } = createCompositeListItem();

  const {
    disabled: contextDisabled,
    handleValueChange,
    state: rootState,
    value: openValues,
  } = useAccordionRootContext();

  const fallbackValue = createBaseUiId();

  const value = () => componentProps.value ?? fallbackValue();

  const disabled = () => (componentProps.disabled ?? false) || contextDisabled();

  const isOpen = () => {
    const values = openValues();
    if (!values) {
      return false;
    }

    for (let i = 0; i < values.length; i += 1) {
      if (values[i] === value()) {
        return true;
      }
    }

    return false;
  };

  const onOpenChange = (nextOpen: boolean, eventDetails: CollapsibleRoot.ChangeEventDetails) => {
    componentProps.onOpenChange?.(nextOpen, eventDetails);

    if (eventDetails.isCanceled) {
      return;
    }

    handleValueChange(value(), nextOpen, eventDetails);
  };

  const collapsible = createCollapsibleRoot({
    open: isOpen,
    onOpenChange,
    disabled,
  });

  const collapsibleState: CollapsibleRootState = {
    get open() {
      return collapsible.open();
    },
    get disabled() {
      return collapsible.disabled();
    },
    get transitionStatus() {
      return collapsible.transitionStatus();
    },
  };

  const collapsibleContext: CollapsibleRootContext = {
    ...collapsible,
    onOpenChange,
    state: collapsibleState,
  };

  const state: AccordionItemState = {
    get value() {
      return rootState.value;
    },
    get disabled() {
      return disabled();
    },
    get orientation() {
      return rootState.orientation;
    },
    get hidden() {
      return !isOpen() && !collapsible.mounted();
    },
    get index() {
      return index();
    },
    get open() {
      return isOpen();
    },
  };

  const defaultTriggerId = createBaseUiId();
  const [triggerIdState, setTriggerId] = useSignal<string | undefined>(undefined, 'triggerIdState');
  const triggerId = () => triggerIdState() ?? defaultTriggerId();

  const accordionItemContext: AccordionItemContext = {
    open: isOpen,
    state,
    setTriggerId,
    triggerId,
  };

  return (
    <CollapsibleRootContext.Provider value={collapsibleContext}>
      <AccordionItemContext.Provider value={accordionItemContext}>
        {renderElement('div', componentProps, {
          defaultClass: 'wheel-Accordion-Item',
          slot: 'accordion-item',
          state,
          ref: listItemRef,
          props: [elementProps as Record<string, any>],
          stateAttributesMapping: accordionStateAttributesMapping,
        })}
      </AccordionItemContext.Provider>
    </CollapsibleRootContext.Provider>
  );
}

export interface AccordionItemState extends AccordionRootState {
  /**
   * Whether the accordion item's panel is currently hidden.
   */
  hidden: boolean;
  /**
   * The item index.
   */
  index: number;
  /**
   * Whether the component is open.
   */
  open: boolean;
}

export interface AccordionItemProps extends BaseUIComponentProps<'div', AccordionItemState> {
  /**
   * A unique value that identifies this accordion item.
   * If no value is provided, a unique ID will be generated automatically.
   * Use when controlling the accordion programmatically, or to set an initial
   * open state.
   * @example
   * ```tsx
   * <Accordion.Root value={['a']}>
   *   <Accordion.Item value="a" /> // initially open
   *   <Accordion.Item value="b" /> // initially closed
   * </Accordion.Root>
   * ```
   */
  value?: any;
  /**
   * Whether the component should ignore user interaction.
   * @default false
   */
  disabled?: boolean | undefined;
  /**
   * Event handler called when the panel is opened or closed.
   */
  onOpenChange?:
    | ((open: boolean, eventDetails: AccordionItem.ChangeEventDetails) => void)
    | undefined;
}

export type AccordionItemChangeEventReason = typeof REASONS.triggerPress | typeof REASONS.none;

export type AccordionItemChangeEventDetails =
  BaseUIChangeEventDetails<AccordionItemChangeEventReason>;

export namespace AccordionItem {
  export type State = AccordionItemState;
  export type Props = AccordionItemProps;
  export type ChangeEventReason = AccordionItemChangeEventReason;
  export type ChangeEventDetails = AccordionItemChangeEventDetails;
}
