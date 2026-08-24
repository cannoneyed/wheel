/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext, type Accessor } from 'solid-js';
import type { Orientation } from '../../internals/types';
import type { CompositeMetadata } from '../../internals/composite/list/CompositeList';
import type { ToolbarRoot } from './ToolbarRoot';

export interface ToolbarRootContext {
  disabled: Accessor<boolean>;
  orientation: Accessor<Orientation>;
  setItemMap: (
    map: Map<Element, CompositeMetadata<ToolbarRoot.ItemMetadata> | null>,
  ) => void;
}

export const ToolbarRootContext = createContext<ToolbarRootContext | undefined>(undefined);

export function useToolbarRootContext(optional: true): ToolbarRootContext | undefined;
export function useToolbarRootContext(optional?: false): ToolbarRootContext;
export function useToolbarRootContext(optional = false) {
  const context = useContext(ToolbarRootContext);
  if (context === undefined && !optional) {
    throw new Error(
      'Base UI Solid: ToolbarRootContext is missing. Toolbar parts must be placed within <Toolbar.Root>.',
    );
  }

  return context;
}
