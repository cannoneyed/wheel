/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
export enum ToastContentDataAttributes {
  /**
   * Present when the toast viewport is expanded.
   * @type {boolean}
   */
  expanded = 'data-expanded',
  /**
   * Present when the toast is behind the frontmost toast in the stack.
   * @type {boolean}
   */
  behind = 'data-behind',
}
