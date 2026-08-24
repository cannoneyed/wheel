/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createEffect, onCleanup, splitProps, type JSX } from 'solid-js';
import { renderElement } from '../../internals/renderElement';
import type { BaseUIComponentProps, NativeButtonProps } from '../../internals/types';
import { createButton } from '../../internals/use-button/createButton';
import { triggerOpenStateMapping } from '../../collapsible/collapsibleOpenStateMapping';
import { useCollapsibleRootContext } from '../../collapsible/root/CollapsibleRootContext';
import type { AccordionItemState } from '../item/AccordionItem';
import { useAccordionItemContext } from '../item/AccordionItemContext';

/**
 * A button that opens and closes the corresponding panel.
 * Renders a `<button>` element.
 *
 * Documentation: [Base UI Accordion](https://base-ui.com/react/components/accordion)
 */
export function AccordionTrigger(componentProps: AccordionTrigger.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'disabled',
    'id',
    'nativeButton',
  ]);

  const { panelId, open, handleTrigger, disabled: contextDisabled } = useCollapsibleRootContext();

  // Mirrors upstream's `disabledProp || contextDisabled`: an explicit
  // `disabled={false}` on the trigger must not re-enable a trigger whose
  // item or root is disabled.
  const disabled = () => (componentProps.disabled ?? false) || contextDisabled();
  const nativeButton = () => componentProps.nativeButton ?? true;

  const { getButtonProps, buttonRef } = createButton({
    disabled,
    focusableWhenDisabled: () => true,
    native: nativeButton,
  });

  const { state, setTriggerId, triggerId } = useAccordionItemContext();

  createEffect(() => {
    const idValue = componentProps.id;
    if (idValue) {
      setTriggerId(idValue);
      onCleanup(() => {
        setTriggerId(undefined);
      });
    }
  });

  return renderElement('button', componentProps, {
    defaultClass: 'wheel-Accordion-Trigger',
    slot: 'accordion-trigger',
    state,
    ref: buttonRef,
    props: [
      () => ({
        'aria-controls': open() ? panelId() : undefined,
        'aria-expanded': open(),
        id: triggerId(),
        onClick: handleTrigger,
      }),
      elementProps as Record<string, any>,
      getButtonProps,
    ],
    stateAttributesMapping: triggerOpenStateMapping,
  });
}

export interface AccordionTriggerState extends AccordionItemState {}

export interface AccordionTriggerProps
  extends NativeButtonProps,
    BaseUIComponentProps<'button', AccordionTriggerState> {}

export namespace AccordionTrigger {
  export type State = AccordionTriggerState;
  export type Props = AccordionTriggerProps;
}
