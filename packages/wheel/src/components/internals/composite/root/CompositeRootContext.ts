/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext, type Accessor } from 'solid-js';

export interface CompositeRootContext {
  highlightedIndex: Accessor<number>;
  onHighlightedIndexChange: (index: number, shouldScrollIntoView?: boolean) => void;
  highlightItemOnHover: Accessor<boolean>;
  /**
   * Makes it possible to control composite components using events that don't
   * originate from their children. For example, a Menubar with detached
   * triggers may define its Menu.Root outside of CompositeRoot. Keyboard
   * events that occur within this menu won't normally be captured by the
   * CompositeRoot, so they need to be forwarded manually using this function.
   */
  relayKeyboardEvent: (event: KeyboardEvent) => void;
}

export const CompositeRootContext = createContext<CompositeRootContext | undefined>(undefined);

export function useCompositeRootContext(optional: true): CompositeRootContext | undefined;
export function useCompositeRootContext(optional?: false): CompositeRootContext;
export function useCompositeRootContext(optional = false) {
  const context = useContext(CompositeRootContext);
  if (context === undefined && !optional) {
    throw new Error(
      'Base UI Solid: CompositeRootContext is missing. Composite parts must be placed within <Composite.Root>.',
    );
  }

  return context;
}
