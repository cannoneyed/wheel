/**
 * Which optional workspace panes exist — structure, not geometry.
 *
 * Framing owns geometry (widths, open state, persistence) keyed by frame id;
 * "is there a second issue list, and for which team" is ordinary application
 * state, so it lives here and the workspace renders one more `Frame.Column`
 * when it is set.
 */
import { Service } from 'wheel/core';

/** The team shown in the secondary split pane, or null when it is closed. */
export class SplitViewService extends Service {
  /** Identity that survives minification (see require-service-name). */
  static override serviceName = 'SplitViewService';

  /** Secondary pane team id; null means no split. Connect directly. */
  readonly splitTeamId = this.atom<string | null>(null, 'splitTeamId');

  /** Open the secondary pane on a team (re-targets an already open pane). */
  readonly openSplit = this.action((teamId: string) => {
    this.splitTeamId.set(teamId);
  }, 'openSplit');

  /** Close the secondary pane. */
  readonly closeSplit = this.action(() => {
    this.splitTeamId.set(null);
  }, 'closeSplit');
}
