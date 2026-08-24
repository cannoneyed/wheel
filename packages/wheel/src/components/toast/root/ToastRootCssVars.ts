/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
export enum ToastRootCssVars {
  /**
   * Indicates the index of the toast in the list.
   * @type {number}
   */
  index = '--toast-index',
  /**
   * Indicates the vertical pixels offset of the toast in the list when expanded.
   * @type {number}
   */
  offsetY = '--toast-offset-y',
  /**
   * Indicates the measured natural height of the toast in pixels.
   * @type {number}
   */
  height = '--toast-height',
  /**
   * Indicates the horizontal swipe movement of the toast.
   * @type {number}
   */
  swipeMovementX = '--toast-swipe-movement-x',
  /**
   * Indicates the vertical swipe movement of the toast.
   * @type {number}
   */
  swipeMovementY = '--toast-swipe-movement-y',
}
