/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createEffect, onCleanup, splitProps, type JSX } from 'solid-js';
import { useDrawerProviderContext } from '../provider/DrawerProviderContext';
import { DrawerBackdropCssVars } from '../backdrop/DrawerBackdropCssVars';
import { DrawerPopupCssVars } from '../popup/DrawerPopupCssVars';
import type { BaseUIComponentProps } from '../../internals/types';
import type { StateAttributesMapping } from '../../internals/getStateAttributesProps';
import { renderElement } from '../../internals/renderElement';

const stateAttributesMapping: StateAttributesMapping<DrawerIndentState> = {
  active(value): Record<string, string> | null {
    if (value) {
      return { 'data-active': '' };
    }
    return { 'data-inactive': '' };
  },
};

/**
 * A wrapper element intended to contain your app's main UI.
 * Applies `data-active` when any drawer within the nearest `<Drawer.Provider>` is open.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Drawer](https://base-ui.com/react/components/drawer)
 */
export function DrawerIndent(componentProps: DrawerIndent.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, ['class', 'style', 'as', 'asChild', 'children']);

  const providerContext = useDrawerProviderContext(true);

  const active = () => providerContext?.active ?? false;
  const visualStateStore = providerContext?.visualStateStore;

  let indentElement: HTMLDivElement | null = null;

  createEffect(() => {
    const element = indentElement;
    if (!element || !visualStateStore) {
      return;
    }

    const syncVisualState = () => {
      const { swipeProgress, frontmostHeight } = visualStateStore.getSnapshot();
      if (swipeProgress <= 0) {
        element.style.setProperty(DrawerBackdropCssVars.swipeProgress, '0');
      } else {
        element.style.setProperty(DrawerBackdropCssVars.swipeProgress, `${swipeProgress}`);
      }

      if (frontmostHeight <= 0) {
        element.style.removeProperty(DrawerPopupCssVars.height);
      } else {
        element.style.setProperty(DrawerPopupCssVars.height, `${frontmostHeight}px`);
      }
    };

    syncVisualState();

    const unsubscribe = visualStateStore.subscribe(syncVisualState);
    onCleanup(() => {
      unsubscribe();
      element.style.setProperty(DrawerBackdropCssVars.swipeProgress, '0');
      element.style.removeProperty(DrawerPopupCssVars.height);
    });
  });

  const state: DrawerIndentState = {
    get active() {
      return active();
    },
  };

  return renderElement('div', componentProps, {
    defaultClass: 'wheel-Drawer-Indent',
    slot: 'drawer-indent',
    ref: (el: HTMLDivElement | null) => {
      indentElement = el;
    },
    state,
    props: [
      {
        style: {
          [DrawerBackdropCssVars.swipeProgress]: '0',
        },
      },
      elementProps,
    ],
    stateAttributesMapping,
  });
}

export interface DrawerIndentState {
  /**
   * Whether any drawer within the nearest <Drawer.Provider> is open.
   */
  active: boolean;
}

export interface DrawerIndentProps extends BaseUIComponentProps<'div', DrawerIndentState> {}

export namespace DrawerIndent {
  export type State = DrawerIndentState;
  export type Props = DrawerIndentProps;
}
