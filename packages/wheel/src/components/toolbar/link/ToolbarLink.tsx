/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import type { BaseUIComponentProps } from '../../internals/types';
import type { ToolbarRoot } from '../root/ToolbarRoot';
import { useToolbarRootContext } from '../root/ToolbarRootContext';
import { CompositeItem } from '../../internals/composite/item/CompositeItem';

const TOOLBAR_LINK_METADATA: ToolbarLink.Metadata = {
  // Links cannot be disabled, but they still occupy a focusable composite item slot.
  disabled: false,
  focusableWhenDisabled: true,
};

/**
 * A link component.
 * Renders an `<a>` element.
 *
 * Documentation: [Base UI Toolbar](https://base-ui.com/react/components/toolbar)
 */
export function ToolbarLink(componentProps: ToolbarLink.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
  ]);

  const { orientation } = useToolbarRootContext();

  const state: ToolbarLink.State = {
    get orientation() {
      return orientation();
    },
  };

  return (
    <CompositeItem
      defaultClass="wheel-Toolbar-Link"
      slot="toolbar-link"
      tag="a"
      as={componentProps.as}
      asChild={componentProps.asChild}
      class={componentProps.class}
      style={componentProps.style}
      metadata={TOOLBAR_LINK_METADATA}
      state={state}
      props={[elementProps as Record<string, any>]}
    >
      {componentProps.children}
    </CompositeItem>
  );
}

export interface ToolbarLinkMetadata {
  disabled: boolean;
  focusableWhenDisabled: boolean;
}

export interface ToolbarLinkState {
  /**
   * The component orientation.
   */
  orientation: ToolbarRoot.Orientation;
}

export interface ToolbarLinkProps extends BaseUIComponentProps<'a', ToolbarLinkState> {}

export namespace ToolbarLink {
  export type Metadata = ToolbarLinkMetadata;
  export type State = ToolbarLinkState;
  export type Props = ToolbarLinkProps;
}
