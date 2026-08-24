import { Service } from 'wheel/core';
import { positionBetween } from 'wheel/sync';

import { IssueService } from './issue-service';
import { IssueTargetService } from './issue-target-service';
import { SelectionService } from './selection-service';
import { TeamService } from './team-service';
import { ViewOptionsService } from './view-options-service';

/** Owns list ordering, board drops, and the board's keyboard cursor. */
export class IssueMovementService extends Service {
  private readonly issues = this.service(IssueService);
  private readonly targets = this.service(IssueTargetService);
  private readonly selection = this.service(SelectionService);
  private readonly teams = this.service(TeamService);
  private readonly viewOptions = this.service(ViewOptionsService);

  /** Move the list cursor by a visible-row delta. */
  readonly moveCursor = (delta: number): void => {
    this.selection.moveCursor(this.targets.visibleIds(), delta);
  };

  /** Extend list selection by a visible-row delta. */
  readonly extendCursor = (delta: number): void => {
    this.selection.extendCursor(this.targets.visibleIds(), delta);
  };

  /** Move the cursor row up/down within its visible group. */
  readonly reorderCursor = this.action((delta: number) => {
    const teamId = this.targets.currentTeamId();
    const cursor = this.selection.cursor.get();
    if (teamId === null || cursor === null) return;
    const issue = this.issues.issue(teamId, cursor);
    if (!issue || issue.archivedAt !== null) return;
    const rows = this.viewOptions.visibleIn(teamId, issue.stateId);
    const index = rows.findIndex((row) => row.id === cursor);
    if (index === -1) return;
    if (delta > 0 && index < rows.length - 1) {
      this.issues.reorder(cursor, {
        sortOrder: positionBetween(
          rows[index + 1].sortOrder,
          rows[index + 2]?.sortOrder
        )
      });
    } else if (delta < 0 && index > 0) {
      this.issues.reorder(cursor, {
        sortOrder: positionBetween(
          rows[index - 2]?.sortOrder,
          rows[index - 1].sortOrder
        )
      });
    }
  }, 'reorderCursor');

  /** Drop a dragged card at `index` within a board column. */
  readonly dropOnBoard = this.action(
    (issueId: string, stateId: string, index: number) => {
      const teamId = this.targets.currentTeamId();
      if (teamId === null) return;
      const issue = this.issues.issue(teamId, issueId);
      if (!issue) return;
      const rows = this.viewOptions
        .boardVisibleIn(teamId, stateId)
        .filter((row) => row.id !== issueId);
      const boardOrder = positionBetween(
        rows[index - 1]?.boardOrder,
        rows[index]?.boardOrder
      );
      if (issue.stateId === stateId) {
        this.issues.reorder(issueId, { boardOrder });
      } else {
        this.issues.move(issueId, stateId, {
          sortOrder: this.issues.insertionOrders(teamId, stateId).sortOrder,
          boardOrder
        });
      }
    },
    'dropOnBoard'
  );

  /** Move the board cursor by column/row deltas, clamped at edges. */
  readonly boardMoveCursor = this.action((dx: number, dy: number) => {
    const teamId = this.targets.currentTeamId();
    if (teamId === null) return;
    const columns = this.teams
      .states(teamId)
      .map((state) => this.viewOptions.boardVisibleIn(teamId, state.id))
      .filter((cards) => cards.length > 0);
    if (columns.length === 0) return;
    const cursor = this.selection.cursor.get();
    let columnIndex = columns.findIndex((cards) =>
      cards.some((card) => card.id === cursor)
    );
    if (columnIndex === -1) {
      this.selection.setCursor(columns[0][0].id);
      return;
    }
    const rowIndex = columns[columnIndex].findIndex(
      (card) => card.id === cursor
    );
    if (dx !== 0) {
      columnIndex = Math.min(
        columns.length - 1,
        Math.max(0, columnIndex + dx)
      );
      const column = columns[columnIndex];
      this.selection.setCursor(
        column[Math.min(rowIndex, column.length - 1)].id
      );
    } else {
      const column = columns[columnIndex];
      const next = Math.min(
        column.length - 1,
        Math.max(0, rowIndex + dy)
      );
      this.selection.setCursor(column[next].id);
    }
  }, 'boardMoveCursor');

  /** Move the cursor card one workflow column left/right. */
  readonly boardShiftColumn = this.action((direction: number) => {
    const teamId = this.targets.currentTeamId();
    const cursor = this.selection.cursor.get();
    if (teamId === null || cursor === null) return;
    const issue = this.issues.issue(teamId, cursor);
    if (!issue) return;
    const states = this.teams.states(teamId);
    const index = states.findIndex((state) => state.id === issue.stateId);
    const target = states[index + direction];
    if (target) {
      this.issues.moveToState(teamId, cursor, target.id);
    }
  }, 'boardShiftColumn');
}
