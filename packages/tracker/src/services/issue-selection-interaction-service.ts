import { Service } from 'wheel/core';
import { ContextMenuService, DialogService } from 'wheel/kit';

import {
  COMPOSER_DIALOG_ID,
  type RowClickModifiers
} from './issue-interaction-contract';
import { IssueService, type IssueDraft } from './issue-service';
import { IssueTargetService } from './issue-target-service';
import type { RouterService } from 'wheel/router';

import { trackerRouter, type TrackerRoutes } from '../routes';
import { SelectionService } from './selection-service';

/** Owns selection gestures, inline editing, peek state, and archive/composer flows. */
export class IssueSelectionInteractionService extends Service {
  /** Identity that survives minification (see require-service-name). */
  static override serviceName = 'IssueSelectionInteractionService';

  private readonly issues = this.service(IssueService);
  private readonly targets = this.service(IssueTargetService);
  private readonly selection = this.service(SelectionService);
  private readonly menus = this.service(ContextMenuService);
  private readonly dialogs = this.service(DialogService);
  private readonly router = this.service(trackerRouter.Service) as RouterService<TrackerRoutes>;

  /** The issue id under inline title edit, or null. */
  readonly editingId = this.atom<string | null>(null, 'editingId');

  /** The issue open in the peek pane, or null. */
  readonly peekId = this.atom<string | null>(null, 'peekId');

  /** Toggle the current cursor row's selection. */
  readonly toggleCursorSelection = (): void => {
    const cursor = this.selection.cursor.get();
    if (cursor !== null) {
      this.selection.toggle(cursor);
    }
  };

  /** Row/card click: shift range, modifier toggle, or plain cursor. */
  readonly rowClick = this.action(
    (issueId: string, modifiers: RowClickModifiers) => {
      if (modifiers.shift) {
        this.selection.selectRangeTo(this.targets.visibleIds(), issueId);
      } else if (modifiers.toggle) {
        this.selection.toggle(issueId);
      } else {
        this.selection.setCursor(issueId);
      }
    },
    'rowClick'
  );

  /** Start inline title editing, defaulting to the cursor row. */
  readonly beginEdit = this.action((issueId?: string) => {
    this.editingId.set(issueId ?? this.selection.cursor.get());
  }, 'beginEdit');

  /** Commit an inline title edit when it changed and is non-empty. */
  readonly commitEdit = this.action((title: string) => {
    const issueId = this.editingId.get();
    this.editingId.set(null);
    if (issueId === null) return;
    const issue = this.issues.locate(issueId);
    const trimmed = title.trim();
    if (!issue || trimmed === '' || trimmed === issue.title) return;
    this.issues.update(issueId, { title: trimmed });
  }, 'commitEdit');

  /** Abandon inline title editing. */
  readonly cancelEdit = this.action(
    () => this.editingId.set(null),
    'cancelEdit'
  );

  /** Archive targets in one undo step and clear selection. */
  readonly archiveTargets = this.action((issueId?: string) => {
    const targets = this.targets.targets(issueId);
    if (targets.length === 0) return;
    this.menus.close();
    this.issues.archive(targets);
    this.selection.clear();
  }, 'archiveTargets');

  /** Restore archived targets. */
  readonly unarchiveTargets = this.action((issueId?: string) => {
    const targets = this.targets.targets(issueId);
    if (targets.length === 0) return;
    this.menus.close();
    this.issues.unarchive(targets);
  }, 'unarchiveTargets');

  /** Permanently delete archived targets after confirmation. */
  readonly deleteTargets = async (issueId?: string): Promise<void> => {
    const targets = this.targets.targets(issueId);
    if (targets.length === 0) return;
    this.menus.close();
    const confirmed = await this.dialogs.confirm(
      `Permanently delete ${
        targets.length === 1 ? 'this issue' : `${targets.length} issues`
      }? This cannot be undone.`,
      { danger: true, confirmLabel: 'Delete forever' }
    );
    if (!confirmed) return;
    this.issues.hardDelete(targets);
    this.selection.clear();
  };

  /** Open the peek pane and place the cursor on the issue. */
  readonly openPeek = this.action((issueId: string | null) => {
    if (issueId === null) return;
    this.peekId.set(issueId);
    this.selection.setCursor(issueId);
  }, 'openPeek');

  /** Close the peek pane. */
  readonly closePeek = this.action(
    () => this.peekId.set(null),
    'closePeek'
  );

  /** Navigate to an issue's full page and close the peek pane. */
  readonly openFull = this.action((issueId: string | null) => {
    if (issueId === null) return;
    this.peekId.set(null);
    this.router.navigate('issue', { params: { issueId } });
  }, 'openFull');

  /** Place the keyboard cursor on an issue. */
  readonly focusIssue = this.action(
    (issueId: string) => this.selection.setCursor(issueId),
    'focusIssue'
  );

  /** Open the issue composer. */
  readonly openComposer = this.action(
    () => this.dialogs.open(COMPOSER_DIALOG_ID),
    'openComposer'
  );

  /** Close the issue composer. */
  readonly closeComposer = this.action(
    () => this.dialogs.closeDialog(COMPOSER_DIALOG_ID),
    'closeComposer'
  );

  /** Create an issue from the composer and select it. */
  readonly submitComposer = this.action((draft: IssueDraft) => {
    const teamId = this.targets.currentTeamId();
    if (teamId === null || draft.title.trim() === '') return;
    const issueId = this.issues.create(teamId, {
      ...draft,
      title: draft.title.trim()
    });
    this.dialogs.closeDialog(COMPOSER_DIALOG_ID);
    this.selection.setCursor(issueId);
  }, 'submitComposer');
}
