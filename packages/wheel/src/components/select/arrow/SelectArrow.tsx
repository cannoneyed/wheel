/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-tracked-show -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
import { Show, splitProps, type JSX } from 'solid-js';
import { useSelectPositionerContext } from '../positioner/SelectPositionerContext';
import { useSelectRootContext } from '../root/SelectRootContext';
import type { BaseUIComponentProps } from '../../internals/types';
import type { Align, Side } from '../../utils/useAnchorPositioning';
import type { StateAttributesMapping } from '../../internals/getStateAttributesProps';
import { popupStateMapping as baseMapping } from '../../utils/popupStateMapping';
import { transitionStatusMapping } from '../../internals/stateAttributesMapping';
import { renderElement } from '../../internals/renderElement';

const stateAttributesMapping: StateAttributesMapping<SelectArrowState> = {
  ...baseMapping,
  ...transitionStatusMapping,
};

/**
 * Displays an element positioned against the select popup anchor.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Select](https://base-ui.com/react/components/select)
 */
export function SelectArrow(componentProps: SelectArrow.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, ['class', 'style', 'as', 'asChild', 'children']);

  const { store } = useSelectRootContext();
  const { side, align, arrowStyles, arrowUncentered, alignItemWithTriggerActive, setArrowElement } =
    useSelectPositionerContext();

  const open = store.useState('open');

  const state: SelectArrow.State = {
    get open() {
      return open();
    },
    get side() {
      return side();
    },
    get align() {
      return align();
    },
    get uncentered() {
      return arrowUncentered();
    },
  };

  return (
    <Show when={!alignItemWithTriggerActive()}>
      {renderElement('div', componentProps, {
        defaultClass: 'wheel-Select-Arrow',
        slot: 'select-arrow',
        state,
        ref: (el: Element | null) => setArrowElement(el),
        props: [() => ({ style: arrowStyles(), 'aria-hidden': true }), elementProps],
        stateAttributesMapping,
      })}
    </Show>
  );
}

export interface SelectArrowState {
  /**
   * Whether the select popup is currently open.
   */
  open: boolean;
  /**
   * The side of the anchor the component is placed on.
   */
  side: Side | 'none';
  /**
   * The alignment of the component relative to the anchor.
   */
  align: Align;
  /**
   * Whether the arrow cannot be centered on the anchor.
   */
  uncentered: boolean;
}

export interface SelectArrowProps extends BaseUIComponentProps<'div', SelectArrowState> {}

export namespace SelectArrow {
  export type State = SelectArrowState;
  export type Props = SelectArrowProps;
}
