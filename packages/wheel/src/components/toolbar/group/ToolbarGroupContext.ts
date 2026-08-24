/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext, type Accessor } from 'solid-js';

export interface ToolbarGroupContext {
  disabled: Accessor<boolean>;
}

export const ToolbarGroupContext = createContext<ToolbarGroupContext | undefined>(undefined);

export function useToolbarGroupContext(optional: true): ToolbarGroupContext | undefined;
export function useToolbarGroupContext(optional?: false): ToolbarGroupContext;
export function useToolbarGroupContext(optional = false) {
  const context = useContext(ToolbarGroupContext);
  if (context === undefined && !optional) {
    throw new Error(
      'Base UI Solid: ToolbarGroupContext is missing. ToolbarGroup parts must be placed within <Toolbar.Group>.',
    );
  }
  return context;
}
