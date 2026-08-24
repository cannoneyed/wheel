/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext, type Accessor } from 'solid-js';
import type { ElementProps } from '../../floating-ui-solid';

/**
 * Solid port of upstream's `NavigationMenuDismissContext`.
 *
 * Deviation: the value is an `Accessor` rather than a plain snapshot — upstream's context value is
 * re-provided on every React render as `floatingRootContext` becomes available, but a Solid
 * component's body runs once, so the reactive dependency has to live inside the accessor itself for
 * consumers (`NavigationMenuTrigger`) to observe later changes.
 */
export const NavigationMenuDismissContext = createContext<
  Accessor<ElementProps | undefined> | undefined
>(undefined);

export function useNavigationMenuDismissContext() {
  return useContext(NavigationMenuDismissContext);
}
