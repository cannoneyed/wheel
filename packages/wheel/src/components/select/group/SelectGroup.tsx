/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { useSignal } from '../../../core/local-state';
import { splitProps, type JSX } from 'solid-js';
import type { BaseUIComponentProps } from '../../internals/types';
import { SelectGroupContext } from './SelectGroupContext';
import { renderElement } from '../../internals/renderElement';

/**
 * Groups related select items with the corresponding label.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Select](https://base-ui.com/react/components/select)
 */
export function SelectGroup(componentProps: SelectGroup.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, ['class', 'style', 'as', 'asChild', 'children']);

  const [labelId, setLabelId] = useSignal<string | undefined>(undefined, 'labelId');

  const contextValue: SelectGroupContext = { labelId, setLabelId };

  return (
    <SelectGroupContext.Provider value={contextValue}>
      {renderElement('div', componentProps, {
        defaultClass: 'wheel-Select-Group',
        slot: 'select-group',
        props: [() => ({ role: 'group', 'aria-labelledby': labelId() }), elementProps],
      })}
    </SelectGroupContext.Provider>
  );
}

export interface SelectGroupState {}

export interface SelectGroupProps extends BaseUIComponentProps<'div', SelectGroupState> {}

export namespace SelectGroup {
  export type State = SelectGroupState;
  export type Props = SelectGroupProps;
}
