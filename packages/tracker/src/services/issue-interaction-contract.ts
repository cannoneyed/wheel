/** The composer dialog registration id. */
export const COMPOSER_DIALOG_ID = 'issue-composer';

/** The shortcuts-help dialog registration id. */
export const SHORTCUTS_DIALOG_ID = 'shortcuts-help';

/** The save-view dialog registration id. */
export const SAVE_VIEW_DIALOG_ID = 'save-view';

/** Modifier state of an issue row/card click. */
export interface RowClickModifiers {
  readonly shift: boolean;
  readonly toggle: boolean;
}
