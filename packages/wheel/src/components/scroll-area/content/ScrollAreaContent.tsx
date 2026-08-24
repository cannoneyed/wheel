/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { onCleanup, onMount, splitProps, type JSX } from 'solid-js';
import type { BaseUIComponentProps, HTMLProps } from '../../internals/types';
import { renderElement } from '../../internals/renderElement';
import { useScrollAreaViewportContext } from '../viewport/ScrollAreaViewportContext';
import { useScrollAreaRootContext } from '../root/ScrollAreaRootContext';
import { scrollAreaStateAttributesMapping } from '../root/stateAttributesMapping';
import type { ScrollAreaRootState } from '../root/ScrollAreaRoot';

/**
 * A container for the content of the scroll area.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Scroll Area](https://base-ui.com/react/components/scroll-area)
 */
export function ScrollAreaContent(componentProps: ScrollAreaContent.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, ['class', 'style', 'as', 'asChild', 'children']);

  const { computeThumbPosition } = useScrollAreaViewportContext();
  const { hasMeasuredScrollbar, viewportState } = useScrollAreaRootContext();

  let contentWrapperRef: HTMLElement | undefined;
  // Captured once at setup time (not synced afterward), matching upstream's
  // `React.useRef(hasMeasuredScrollbar)` — a ref initialized from, but never re-synced to, the
  // prop/signal.
  const computeOnInitialResize = hasMeasuredScrollbar();

  onMount(() => {
    if (typeof ResizeObserver === 'undefined' || !contentWrapperRef) {
      return;
    }

    let hasInitialized = false;
    const resizeObserver = new ResizeObserver(() => {
      if (!hasInitialized) {
        hasInitialized = true;

        // ResizeObserver fires once upon observing. Skip that initial call to avoid
        // double-calculating the thumb position on mount, unless the content mounted
        // after the viewport's initial measurement (in which case this fire is what
        // brings the overflow state in sync).
        if (!computeOnInitialResize) {
          return;
        }
      }

      computeThumbPosition();
    });

    resizeObserver.observe(contentWrapperRef);

    onCleanup(() => {
      resizeObserver.disconnect();
    });
  });

  return renderElement('div', componentProps, {
    defaultClass: 'wheel-ScrollArea-Content',
    slot: 'scroll-area-content',
    ref: (el: HTMLElement) => {
      contentWrapperRef = el;
    },
    state: viewportState,
    stateAttributesMapping: scrollAreaStateAttributesMapping,
    props: [
      {
        role: 'presentation',
        style: {
          'min-width': 'fit-content',
        },
      },
      elementProps as HTMLProps,
    ],
  });
}

export interface ScrollAreaContentState extends ScrollAreaRootState {}

export interface ScrollAreaContentProps
  extends BaseUIComponentProps<'div', ScrollAreaContentState> {}

export namespace ScrollAreaContent {
  export type State = ScrollAreaContentState;
  export type Props = ScrollAreaContentProps;
}
