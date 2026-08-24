/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps } from 'solid-js';
import { renderElement } from '../../internals/renderElement';
import type { BaseUIComponentProps } from '../../internals/types';
import { createCollapsibleRoot } from './createCollapsibleRoot';
import { CollapsibleRootContext } from './CollapsibleRootContext';
import { collapsibleStateAttributesMapping } from './stateAttributesMapping';
import type { BaseUIChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import type { TransitionStatus } from '../../internals/createTransitionStatus';

/**
 * Groups all parts of the collapsible.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Collapsible](https://base-ui.com/react/components/collapsible)
 */
export function CollapsibleRoot(componentProps: CollapsibleRoot.Props) {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'defaultOpen',
    'disabled',
    'onOpenChange',
    'open',
  ]);

  const disabled = () => componentProps.disabled ?? false;

  const onOpenChange = (open: boolean, eventDetails: CollapsibleRoot.ChangeEventDetails) => {
    componentProps.onOpenChange?.(open, eventDetails);
  };

  const collapsible = createCollapsibleRoot({
    open: () => componentProps.open,
    defaultOpen: () => componentProps.defaultOpen,
    onOpenChange,
    disabled,
  });

  const state: CollapsibleRoot.State = {
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

  const contextValue: CollapsibleRootContext = {
    ...collapsible,
    onOpenChange,
    state,
  };

  return (
    <CollapsibleRootContext.Provider value={contextValue}>
      {renderElement('div', componentProps, {
        defaultClass: 'wheel-Collapsible-Root',
        slot: 'collapsible-root',
        state,
        props: [elementProps as Record<string, any>],
        stateAttributesMapping: collapsibleStateAttributesMapping,
      })}
    </CollapsibleRootContext.Provider>
  );
}

export interface CollapsibleRootState {
  /**
   * Whether the collapsible panel is currently open.
   */
  open: boolean;
  /**
   * Whether the component should ignore user interaction.
   */
  disabled: boolean;
  /**
   * The transition status of the component.
   */
  transitionStatus: TransitionStatus;
}

export interface CollapsibleRootProps extends BaseUIComponentProps<'div', CollapsibleRootState> {
  /**
   * Whether the collapsible panel is currently open.
   *
   * To render an uncontrolled collapsible, use the `defaultOpen` prop instead.
   */
  open?: boolean | undefined;
  /**
   * Whether the collapsible panel is initially open.
   *
   * To render a controlled collapsible, use the `open` prop instead.
   * @default false
   */
  defaultOpen?: boolean | undefined;
  /**
   * Event handler called when the panel is opened or closed.
   */
  onOpenChange?:
    | ((open: boolean, eventDetails: CollapsibleRootChangeEventDetails) => void)
    | undefined;
  /**
   * Whether the component should ignore user interaction.
   * @default false
   */
  disabled?: boolean | undefined;
}

export type CollapsibleRootChangeEventReason = typeof REASONS.triggerPress | typeof REASONS.none;
export type CollapsibleRootChangeEventDetails =
  BaseUIChangeEventDetails<CollapsibleRootChangeEventReason>;

export namespace CollapsibleRoot {
  export type State = CollapsibleRootState;
  export type Props = CollapsibleRootProps;
  export type ChangeEventReason = CollapsibleRootChangeEventReason;
  export type ChangeEventDetails = CollapsibleRootChangeEventDetails;
}
