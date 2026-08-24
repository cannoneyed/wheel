/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import type { BaseUIComponentProps } from '../../internals/types';
import { renderElement } from '../../internals/renderElement';
import { useToolbarRootContext } from '../root/ToolbarRootContext';
import type { ToolbarRootState } from '../root/ToolbarRoot';
import {
  ToolbarGroupContext,
  type ToolbarGroupContext as ToolbarGroupContextValue,
} from './ToolbarGroupContext';

/**
 * Groups several toolbar items or toggles.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Toolbar](https://base-ui.com/react/components/toolbar)
 */
export function ToolbarGroup(componentProps: ToolbarGroup.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'disabled',
  ]);

  const disabledProp = () => componentProps.disabled ?? false;

  const { orientation, disabled: toolbarDisabled } = useToolbarRootContext();

  const disabled = () => toolbarDisabled() || disabledProp();

  const contextValue: ToolbarGroupContextValue = {
    disabled,
  };

  const state: ToolbarGroup.State = {
    get disabled() {
      return disabled();
    },
    get orientation() {
      return orientation();
    },
  };

  // The context Provider must wrap the actual rendered element so that
  // descendants — the toolbar items that read `ToolbarGroupContext` while
  // rendering — see the context.
  return (
    <ToolbarGroupContext.Provider value={contextValue}>
      {renderElement('div', componentProps, {
        defaultClass: 'wheel-Toolbar-Group',
        slot: 'toolbar-group',
        state,
        props: [{ role: 'group' }, elementProps as Record<string, any>],
      })}
    </ToolbarGroupContext.Provider>
  );
}

export interface ToolbarGroupState extends ToolbarRootState {}

export interface ToolbarGroupProps extends BaseUIComponentProps<'div', ToolbarGroupState> {
  /**
   * When `true` all toolbar items in the group are disabled.
   * @default false
   */
  disabled?: boolean | undefined;
}

export namespace ToolbarGroup {
  export type State = ToolbarGroupState;
  export type Props = ToolbarGroupProps;
}
