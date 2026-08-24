/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps } from 'solid-js';
import { renderElement } from '../../internals/renderElement';
import type { BaseUIComponentProps, NativeButtonProps } from '../../internals/types';
import type { StateAttributesMapping } from '../../internals/getStateAttributesProps';
import { createButton } from '../../internals/use-button/createButton';
import { transitionStatusMapping } from '../../internals/stateAttributesMapping';
import { triggerOpenStateMapping } from '../collapsibleOpenStateMapping';
import { useCollapsibleRootContext } from '../root/CollapsibleRootContext';
import type { CollapsibleRootState } from '../root/CollapsibleRoot';

const stateAttributesMapping: StateAttributesMapping<CollapsibleRootState> = {
  ...triggerOpenStateMapping,
  ...transitionStatusMapping,
};

/**
 * A button that opens and closes the collapsible panel.
 * Renders a `<button>` element.
 *
 * Documentation: [Base UI Collapsible](https://base-ui.com/react/components/collapsible)
 */
export function CollapsibleTrigger(componentProps: CollapsibleTrigger.Props) {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'disabled',
    'nativeButton',
  ]);

  const { panelId, open, handleTrigger, state, disabled: contextDisabled } =
    useCollapsibleRootContext();

  const disabled = () => componentProps.disabled ?? contextDisabled();
  const nativeButton = () => componentProps.nativeButton ?? true;

  const { getButtonProps, buttonRef } = createButton({
    disabled,
    focusableWhenDisabled: () => true,
    native: nativeButton,
  });

  return renderElement('button', componentProps, {
    defaultClass: 'wheel-Collapsible-Trigger',
    slot: 'collapsible-trigger',
    state,
    ref: buttonRef,
    props: [
      () => ({
        'aria-controls': open() ? panelId() : undefined,
        'aria-expanded': open(),
        onClick: handleTrigger,
      }),
      elementProps as Record<string, any>,
      getButtonProps,
    ],
    stateAttributesMapping,
  });
}

export interface CollapsibleTriggerState extends CollapsibleRootState {}

export interface CollapsibleTriggerProps
  extends NativeButtonProps,
    BaseUIComponentProps<'button', CollapsibleTriggerState> {}

export namespace CollapsibleTrigger {
  export type State = CollapsibleTriggerState;
  export type Props = CollapsibleTriggerProps;
}
