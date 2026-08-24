/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import type { BaseUIComponentProps, HTMLProps } from '../../internals/types';
import { renderElement } from '../../internals/renderElement';
import { useScrollAreaRootContext } from '../root/ScrollAreaRootContext';

/**
 * A small rectangular area that appears at the intersection of horizontal and vertical scrollbars.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Scroll Area](https://base-ui.com/react/components/scroll-area)
 */
export function ScrollAreaCorner(componentProps: ScrollAreaCorner.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, ['class', 'style', 'as', 'asChild', 'children']);

  const { cornerRef, cornerSize, hiddenState } = useScrollAreaRootContext();

  return renderElement('div', componentProps, {
    defaultClass: 'wheel-ScrollArea-Corner',
    slot: 'scroll-area-corner',
    ref: (el: HTMLElement) => {
      cornerRef.current = el;
    },
    props: [
      () => ({
        style: {
          position: 'absolute',
          bottom: '0',
          'inset-inline-end': '0',
          width: `${cornerSize().width}px`,
          height: `${cornerSize().height}px`,
        },
      }),
      elementProps as HTMLProps,
    ],
    enabled: () => !hiddenState().corner,
  });
}

export interface ScrollAreaCornerState {}

export interface ScrollAreaCornerProps extends BaseUIComponentProps<'div', ScrollAreaCornerState> {}

export namespace ScrollAreaCorner {
  export type State = ScrollAreaCornerState;
  export type Props = ScrollAreaCornerProps;
}
