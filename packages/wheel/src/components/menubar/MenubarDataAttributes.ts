/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
export enum MenubarDataAttributes {
  /**
   * Present when the corresponding menubar is modal.
   */
  modal = 'data-modal',
  /**
   * Determines the orientation of the menubar.
   * @type {'horizontal' | 'vertical'}
   */
  orientation = 'data-orientation',
  /**
   * Present when any submenu within the menubar is open.
   */
  hasSubmenuOpen = 'data-has-submenu-open',
}
