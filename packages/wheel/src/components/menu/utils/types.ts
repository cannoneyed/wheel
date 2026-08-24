/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import type { MenuRoot } from '../root/MenuRoot';

export interface MenuOpenEventDetails {
  open: boolean;
  reason: MenuRoot.ChangeEventReason | null;
  nodeId: string | undefined;
  parentNodeId: string | null;
}
