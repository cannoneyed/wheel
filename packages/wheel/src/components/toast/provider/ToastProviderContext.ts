/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext } from 'solid-js';
import { ToastStore } from '../store/ToastStore';

export type ToastContext = ToastStore;

export const ToastContext = createContext<ToastContext | undefined>(undefined);

export function useToastProviderContext(): ToastContext {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('Base UI: useToastManager must be used within <Toast.Provider>.');
  }
  return context;
}
