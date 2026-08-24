/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import type { TabsRootState } from './root/TabsRoot';
import type { StateAttributesMapping } from '../internals/getStateAttributesProps';

export const tabsStateAttributesMapping: StateAttributesMapping<TabsRootState> = {
  tabActivationDirection: (dir) => ({
    'data-activation-direction': dir,
  }),
};
