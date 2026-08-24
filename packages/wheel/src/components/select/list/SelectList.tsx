/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import type { BaseUIComponentProps, HTMLProps } from '../../internals/types';
import { useSelectRootContext } from '../root/SelectRootContext';
import { useSelectPositionerContext } from '../positioner/SelectPositionerContext';
import { renderElement } from '../../internals/renderElement';
import { LIST_FUNCTIONAL_STYLES } from '../popup/utils';

/**
 * A container for the select items.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Select](https://base-ui.com/react/components/select)
 *
 * Deviation: upstream applies `styleDisableScrollbar`'s CSP-aware `<style>` element/class name
 * here when scroll arrows are present; not ported (see `SelectPopup.tsx`'s deviation note) — the
 * list scrolls with the browser's default scrollbar instead of a hidden one.
 */
export function SelectList(componentProps: SelectList.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, ['class', 'style', 'as', 'asChild', 'children']);

  const { store, scrollHandlerRef } = useSelectRootContext();
  const { alignItemWithTriggerActive } = useSelectPositionerContext();

  const openMethod = store.useState('openMethod');
  const multiple = store.useState('multiple');
  const id = store.useState('id');

  const defaultProps = (): HTMLProps => ({
    id: `${id()}-list`,
    role: 'listbox',
    'aria-multiselectable': multiple() || undefined,
    onScroll(event: Event) {
      scrollHandlerRef.current?.(event.currentTarget as HTMLDivElement);
    },
    ...(alignItemWithTriggerActive() ? { style: LIST_FUNCTIONAL_STYLES } : {}),
  });

  return renderElement('div', componentProps, {
    defaultClass: 'wheel-Select-List',
    slot: 'select-list',
    ref: (el: HTMLElement | null) => {
      store.set('listElement', el as HTMLDivElement | null);
    },
    props: [defaultProps, elementProps],
  });
}

export interface SelectListProps extends BaseUIComponentProps<'div', SelectListState> {}

export interface SelectListState {}

export namespace SelectList {
  export type Props = SelectListProps;
  export type State = SelectListState;
}
