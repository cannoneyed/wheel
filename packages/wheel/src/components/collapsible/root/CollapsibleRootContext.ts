/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext } from 'solid-js';
import type { CreateCollapsibleRootReturnValue } from './createCollapsibleRoot';
import type { CollapsibleRoot, CollapsibleRootState } from './CollapsibleRoot';

export interface CollapsibleRootContext extends CreateCollapsibleRootReturnValue {
  onOpenChange: (open: boolean, eventDetails: CollapsibleRoot.ChangeEventDetails) => void;
  state: CollapsibleRootState;
}

export const CollapsibleRootContext = createContext<CollapsibleRootContext | undefined>(
  undefined,
);

export function useCollapsibleRootContext() {
  const context = useContext(CollapsibleRootContext);
  if (context === undefined) {
    throw new Error(
      'Base UI Solid: CollapsibleRootContext is missing. Collapsible parts must be placed within <Collapsible.Root>.',
    );
  }

  return context;
}
