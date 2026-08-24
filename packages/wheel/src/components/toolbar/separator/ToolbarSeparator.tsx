/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import type { Orientation } from '../../internals/types';
import { Separator, type SeparatorProps, type SeparatorState } from '../../separator';
import { useToolbarRootContext } from '../root/ToolbarRootContext';
import type { ToolbarRoot } from '../root/ToolbarRoot';

const OPPOSITE_ORIENTATION: Record<ToolbarRoot.Orientation, ToolbarRoot.Orientation> = {
  vertical: 'horizontal',
  horizontal: 'vertical',
};

/**
 * A separator element accessible to screen readers.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Toolbar](https://base-ui.com/react/components/toolbar)
 */
export function ToolbarSeparator(componentProps: ToolbarSeparator.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, ['orientation']);

  const { orientation: toolbarOrientation } = useToolbarRootContext();

  const orientation = (): Orientation =>
    componentProps.orientation ?? OPPOSITE_ORIENTATION[toolbarOrientation()];

  return (
    <Separator
      {...(elementProps as SeparatorProps)}
      defaultClass="wheel-Toolbar-Separator"
      slot="toolbar-separator"
      orientation={orientation()}
    />
  );
}

export interface ToolbarSeparatorState extends SeparatorState {}

export interface ToolbarSeparatorProps extends SeparatorProps {
  /**
   * The orientation of the separator. Defaults to the opposite of the
   * toolbar's orientation, so a horizontal toolbar renders vertical
   * separators.
   */
  orientation?: Orientation | undefined;
}

export namespace ToolbarSeparator {
  export type State = ToolbarSeparatorState;
  export type Props = ToolbarSeparatorProps;
}
