/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import { useDrawerProviderContext } from '../provider/DrawerProviderContext';
import type { BaseUIComponentProps } from '../../internals/types';
import type { StateAttributesMapping } from '../../internals/getStateAttributesProps';
import { renderElement } from '../../internals/renderElement';

const stateAttributesMapping: StateAttributesMapping<DrawerIndentBackgroundState> = {
  active(value): Record<string, string> | null {
    if (value) {
      return { 'data-active': '' };
    }
    return { 'data-inactive': '' };
  },
};

/**
 * An element placed before `<Drawer.Indent>` to render a background layer that can be styled based
 * on whether any drawer is open.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Drawer](https://base-ui.com/react/components/drawer)
 */
export function DrawerIndentBackground(componentProps: DrawerIndentBackground.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, ['class', 'style', 'as', 'asChild', 'children']);

  const providerContext = useDrawerProviderContext(true);
  const active = () => providerContext?.active ?? false;

  const state: DrawerIndentBackgroundState = {
    get active() {
      return active();
    },
  };

  return renderElement('div', componentProps, {
    defaultClass: 'wheel-Drawer-IndentBackground',
    slot: 'drawer-indent-background',
    state,
    props: [elementProps],
    stateAttributesMapping,
  });
}

export interface DrawerIndentBackgroundState {
  /**
   * Whether any drawer within the nearest <Drawer.Provider> is open.
   */
  active: boolean;
}

export interface DrawerIndentBackgroundProps
  extends BaseUIComponentProps<'div', DrawerIndentBackgroundState> {}

export namespace DrawerIndentBackground {
  export type State = DrawerIndentBackgroundState;
  export type Props = DrawerIndentBackgroundProps;
}
