/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext } from 'solid-js';
import { DrawerStore } from '../store/DrawerStore';

export type DrawerRootContext<Payload = unknown> = DrawerStore<Payload>;

export const DrawerRootContext = createContext<DrawerRootContext | undefined>(undefined);

export function useDrawerRootContext(optional?: false): DrawerRootContext;
export function useDrawerRootContext(optional: true): DrawerRootContext | undefined;
export function useDrawerRootContext(optional?: boolean) {
  const context = useContext(DrawerRootContext);

  if (context === undefined && !optional) {
    throw new Error(
      'Base UI: DrawerRootContext is missing. Drawer parts must be placed within <Drawer.Root>.',
    );
  }

  return context;
}
