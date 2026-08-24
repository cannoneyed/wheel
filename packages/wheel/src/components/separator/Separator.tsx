/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps } from 'solid-js';
import type { BaseUIComponentProps, Orientation } from '../internals/types';
import { renderElement } from '../internals/renderElement';

/**
 * A separator element accessible to screen readers.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Separator](https://base-ui.com/react/components/separator)
 */
interface SeparatorPrivateProps {
  defaultClass?: string | undefined;
  slot?: string | undefined;
}

export function Separator(componentProps: Separator.Props & SeparatorPrivateProps) {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'orientation',
    'defaultClass',
    'slot',
  ]);

  const orientation = () => componentProps.orientation ?? 'horizontal';

  const state: Separator.State = {
    get orientation() {
      return orientation();
    },
  };

  return renderElement('div', componentProps, {
    defaultClass: componentProps.defaultClass ?? 'wheel-Separator',
    slot: componentProps.slot ?? 'separator',
    state,
    props: [
      () => ({ role: 'separator', 'aria-orientation': orientation() }),
      elementProps as Record<string, any>,
    ],
  });
}

export interface SeparatorProps extends BaseUIComponentProps<'div', SeparatorState> {
  /**
   * The orientation of the separator.
   * @default 'horizontal'
   */
  orientation?: Orientation | undefined;
}

export interface SeparatorState {
  /**
   * The orientation of the separator.
   */
  orientation: Orientation;
}

export namespace Separator {
  export type Props = SeparatorProps;
  export type State = SeparatorState;
}
