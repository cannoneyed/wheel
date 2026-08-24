/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
export enum ToolbarButtonDataAttributes {
  /**
   * Present when the button is disabled.
   */
  disabled = 'data-disabled',
  /**
   * Indicates the orientation of the toolbar.
   * @type {'horizontal' | 'vertical'}
   */
  orientation = 'data-orientation',
  /**
   * Present when the button remains focusable when disabled.
   */
  focusable = 'data-focusable',
}
