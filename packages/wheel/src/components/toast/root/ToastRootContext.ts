/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext, type Accessor } from 'solid-js';
import type { ToastObject } from '../useToastManager';

export interface ToastRootContext {
  toast: ToastObject<any>;
  getRootElement: () => HTMLElement | undefined;
  titleId: Accessor<string | undefined>;
  setTitleId: (id: string | undefined) => void;
  descriptionId: Accessor<string | undefined>;
  setDescriptionId: (id: string | undefined) => void;
  swiping: Accessor<boolean>;
  swipeDirection: Accessor<'up' | 'down' | 'left' | 'right' | undefined>;
  index: Accessor<number>;
  visibleIndex: Accessor<number>;
  expanded: Accessor<boolean>;
  recalculateHeight: (flushSync?: boolean) => void;
}

export const ToastRootContext = createContext<ToastRootContext | undefined>(undefined);

export function useToastRootContext(): ToastRootContext {
  const context = useContext(ToastRootContext);
  if (!context) {
    throw new Error(
      'Base UI: ToastRootContext is missing. Toast parts must be used within <Toast.Root>.',
    );
  }
  return context;
}
