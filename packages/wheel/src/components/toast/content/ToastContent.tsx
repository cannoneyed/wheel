/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { onCleanup, onMount, splitProps, type JSX } from 'solid-js';
import type { BaseUIComponentProps } from '../../internals/types';
import { useToastRootContext } from '../root/ToastRootContext';
import { renderElement } from '../../internals/renderElement';

/**
 * A container for the contents of a toast.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Toast](https://base-ui.com/react/components/toast)
 */
export function ToastContent(componentProps: ToastContent.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, ['class', 'style', 'as', 'asChild', 'children']);

  const context = useToastRootContext();

  let contentRef: HTMLDivElement | undefined;

  onMount(() => {
    const node = contentRef;
    if (!node) {
      return;
    }

    context.recalculateHeight();

    if (typeof ResizeObserver !== 'function' || typeof MutationObserver !== 'function') {
      return;
    }

    const resizeObserver = new ResizeObserver(() => context.recalculateHeight(true));
    const mutationObserver = new MutationObserver(() => context.recalculateHeight(true));

    resizeObserver.observe(node);
    mutationObserver.observe(node, { childList: true, subtree: true, characterData: true });

    onCleanup(() => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    });
  });

  const state: ToastContentState = {
    get expanded() {
      return context.expanded();
    },
    get behind() {
      return context.visibleIndex() > 0;
    },
  };

  return renderElement('div', componentProps, {
    defaultClass: 'wheel-Toast-Content',
    slot: 'toast-content',
    ref: (el: HTMLDivElement) => {
      contentRef = el;
    },
    state,
    props: elementProps,
  });
}

export interface ToastContentState {
  /**
   * Whether the toast viewport is expanded.
   */
  expanded: boolean;
  /**
   * Whether the toast is behind the frontmost toast in the stack.
   */
  behind: boolean;
}

export interface ToastContentProps extends BaseUIComponentProps<'div', ToastContentState> {}

export namespace ToastContent {
  export type State = ToastContentState;
  export type Props = ToastContentProps;
}
