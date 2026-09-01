/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { useSignal } from '../../../core/local-state';
import { splitProps, type JSX } from 'solid-js';
import { renderElement } from '../../internals/renderElement';
import type { BaseUIComponentProps } from '../../internals/types';
import { MenuGroupContext } from './MenuGroupContext';

/**
 * Groups related menu items with the given label.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Menu](https://base-ui.com/react/components/menu)
 */
export function MenuGroup(componentProps: MenuGroup.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, ['class', 'style', 'as', 'asChild', 'children']);

  const [labelId, setLabelId] = useSignal<string | undefined>(undefined, 'labelId');

  return (
    <MenuGroupContext.Provider value={setLabelId}>
      {renderElement('div', componentProps, {
        defaultClass: 'wheel-Menu-Group',
        slot: 'menu-group',
        state: EMPTY_STATE,
        props: [
          () => ({ role: 'group' as const, 'aria-labelledby': labelId() }),
          elementProps,
        ],
      })}
    </MenuGroupContext.Provider>
  );
}

const EMPTY_STATE: MenuGroup.State = {};

export interface MenuGroupState {}

export interface MenuGroupProps extends BaseUIComponentProps<'div', MenuGroupState> {}

export namespace MenuGroup {
  export type State = MenuGroupState;
  export type Props = MenuGroupProps;
}
