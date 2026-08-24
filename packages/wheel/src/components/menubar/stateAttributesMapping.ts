/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import type { MenubarState } from './Menubar';
import type { StateAttributesMapping } from '../internals/getStateAttributesProps';
import { MenubarDataAttributes } from './MenubarDataAttributes';

export const menubarStateAttributesMapping: StateAttributesMapping<MenubarState> = {
  hasSubmenuOpen(value): Record<string, string> | null {
    if (value) {
      return { [MenubarDataAttributes.hasSubmenuOpen]: '' };
    }
    return null;
  },
};
