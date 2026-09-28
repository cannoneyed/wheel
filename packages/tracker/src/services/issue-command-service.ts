import { Service } from 'wheel/core';
import {
  CommandService,
  DialogService,
  KeyboardService,
  type CommandContext,
  type CommandSpec,
  type KeySpec
} from 'wheel/kit';

import { SHORTCUTS_DIALOG_ID } from './issue-interaction-contract';
import type { RouterService } from 'wheel/router';

import { trackerRouter, type TrackerRoutes } from '../routes';
import { PaneService } from './pane-service';
import { PickerService } from './picker-service';
import { SearchService } from './search-service';
import { SelectionService } from './selection-service';
import { ViewOptionsService } from './view-options-service';

/** Issue actions consumed by the global keyboard and command registries. */
export interface IssueCommandActions {
  readonly currentTeamId: () => string | null;
  readonly peekId: () => string | null;
  readonly hasTarget: () => boolean;
  readonly moveCursor: (delta: number) => void;
  readonly extendCursor: (delta: number) => void;
  readonly boardMoveCursor: (dx: number, dy: number) => void;
  readonly boardShiftColumn: (direction: number) => void;
  readonly toggleCursorSelection: () => void;
  readonly closePeek: () => void;
  readonly openPeek: (issueId: string | null) => void;
  readonly openFull: (issueId: string | null) => void;
  readonly openStatusPicker: () => void;
  readonly openAssigneePicker: () => void;
  readonly openPriorityPicker: () => void;
  readonly openLabelPicker: () => void;
  readonly openProjectPicker: () => void;
  readonly openCyclePicker: () => void;
  readonly beginEdit: () => void;
  readonly reorderCursor: (delta: number) => void;
  readonly archiveTargets: () => void;
  readonly openComposer: () => void;
  readonly openTeamNavPicker: () => void;
  readonly openProjectNavPicker: () => void;
  readonly openSaveViewDialog: () => void;
}

/**
 * Owns Tracker's command table: each action is one `CommandService` command
 * whose keys, palette row, and rules come from one record.
 */
export class IssueCommandService extends Service {
  /** Identity that survives minification (see require-service-name). */
  static override serviceName = 'IssueCommandService';

  private readonly keyboard = this.service(KeyboardService);
  private readonly commands = this.service(CommandService);
  private readonly dialogs = this.service(DialogService);
  private readonly picker = this.service(PickerService);
  private readonly pane = this.service(PaneService);
  private readonly search = this.service(SearchService);
  private readonly router = this.service(trackerRouter.Service) as RouterService<TrackerRoutes>;
  private readonly selection = this.service(SelectionService);
  private readonly viewOptions = this.service(ViewOptionsService);
  private readonly installed = this.field(false);
  private readonly chordUntil = this.atom<number>(0, 'chordUntil');
  private readonly cancelChordTimer = this.field<(() => void) | undefined>(undefined);

  private armChord(): void {
    this.chordUntil.set(this.now() + 1_500);
    this.cancelChordTimer.get()?.();
    this.cancelChordTimer.set(this.defer(1_500, () => {
      this.cancelChordTimer.set(undefined);
      this.chordUntil.set(0);
    }));
  }

  private chordArmed(): boolean {
    const armed = this.now() < this.chordUntil.get();
    if (armed) {
      this.chordUntil.set(0);
      this.cancelChordTimer.get()?.();
      this.cancelChordTimer.set(undefined);
    }
    return armed;
  }

  /** Register the primary pane's complete global interaction map once. */
  install(actions: IssueCommandActions): void {
    if (this.installed.get()) {
      throw new Error('IssueCommandService.install() may only run once.');
    }
    this.installed.set(true);
    if (!this.pane.isPrimary()) return;

    const onTeam = () => actions.currentTeamId() !== null;
    const onIssues = () =>
      onTeam() ||
      this.router.routeName() === 'issue' ||
      actions.peekId() !== null;
    const onList = () => this.router.routeName() === 'team.issues';
    const onBoard = () => this.router.routeName() === 'team.board';
    const noOverlay = () =>
      this.dialogs.openId.get() === null && !this.picker.isOpen();
    const cursor = () => this.selection.cursor.get();
    const needsTarget = () =>
      actions.hasTarget() ? (true as const) : { reason: 'Select an issue first' };
    // Every key waits while a dialog or picker is open. The palette is an
    // overlay too, and KeyboardService already gates keys behind it.
    const key = (combo: string, when?: () => boolean): KeySpec =>
      when
        ? { key: combo, when: () => noOverlay() && when() }
        : { key: combo, when: noOverlay };
    const command = <Args = void>(spec: CommandSpec<CommandContext, Args>) =>
      this.addCleanup(this.commands.register(spec));

    // Key-only moves: not in the palette. Everything that decides whether
    // the key applies is `visible`, so the key falls through when it does
    // not (Space still scrolls with no issue under the cursor).
    const move = (
      id: string,
      title: string,
      keys: readonly string[],
      visible: () => boolean,
      run: () => void
    ) =>
      command({
        id,
        title,
        keys: keys.map((combo) => key(combo)),
        palette: false,
        visible: () => visible(),
        run: () => run()
      });
    move('tracker.list.next', 'Next issue', ['arrowdown', 'j'], onList, () => actions.moveCursor(1));
    move('tracker.list.previous', 'Previous issue', ['arrowup', 'k'], onList, () => actions.moveCursor(-1));
    move('tracker.list.extendDown', 'Extend selection down', ['shift+arrowdown'], onList, () =>
      actions.extendCursor(1)
    );
    move('tracker.list.extendUp', 'Extend selection up', ['shift+arrowup'], onList, () => actions.extendCursor(-1));
    move('tracker.board.down', 'Next card in column', ['arrowdown'], onBoard, () => actions.boardMoveCursor(0, 1));
    move('tracker.board.up', 'Previous card in column', ['arrowup'], onBoard, () => actions.boardMoveCursor(0, -1));
    move('tracker.board.left', 'Column left', ['arrowleft'], onBoard, () => actions.boardMoveCursor(-1, 0));
    move('tracker.board.right', 'Column right', ['arrowright'], onBoard, () => actions.boardMoveCursor(1, 0));
    move('tracker.board.shiftLeft', 'Move card one column left', ['alt+arrowleft'], onBoard, () =>
      actions.boardShiftColumn(-1)
    );
    move('tracker.board.shiftRight', 'Move card one column right', ['alt+arrowright'], onBoard, () =>
      actions.boardShiftColumn(1)
    );
    move('tracker.selection.toggle', 'Select issue', ['x'], () => onList() || onBoard(), () => actions.toggleCursorSelection());
    move('tracker.peek.close', 'Close peek', ['escape'], () => actions.peekId() !== null, () => actions.closePeek());
    move(
      'tracker.issue.peek',
      'Peek issue',
      ['space'],
      () => (onList() || onBoard()) && cursor() !== null,
      () => actions.openPeek(cursor())
    );
    move(
      'tracker.issue.open',
      'Open issue',
      ['enter'],
      () => (onList() || onBoard()) && cursor() !== null,
      () => actions.openFull(cursor())
    );
    move('tracker.issue.edit', 'Edit title', ['e'], () => onList() && cursor() !== null, () => actions.beginEdit());
    move(
      'tracker.list.reorderDown',
      'Move issue down',
      ['alt+arrowdown'],
      () => onList() && this.viewOptions.ordering.get() === 'manual',
      () => actions.reorderCursor(1)
    );
    move(
      'tracker.list.reorderUp',
      'Move issue up',
      ['alt+arrowup'],
      () => onList() && this.viewOptions.ordering.get() === 'manual',
      () => actions.reorderCursor(-1)
    );

    // Issue actions: one command each, in the palette AND on a key. The
    // palette lists them wherever an issue can be the target, dimmed with
    // the reason until one is.
    command({
      id: 'issues.new',
      title: 'New issue',
      keywords: ['create', 'add'],
      keys: [key('c')],
      visible: onTeam,
      run: () => actions.openComposer()
    });
    const issueAction = (id: string, title: string, combo: string, run: () => void) =>
      command({ id, title, keys: [key(combo)], visible: onIssues, enabled: needsTarget, run: () => run() });
    issueAction('issues.status', 'Change status…', 's', actions.openStatusPicker);
    issueAction('issues.assign', 'Assign…', 'a', actions.openAssigneePicker);
    issueAction('issues.priority', 'Set priority…', 'p', actions.openPriorityPicker);
    issueAction('issues.labels', 'Change labels…', 'l', actions.openLabelPicker);
    issueAction('issues.project', 'Move to project…', 'shift+p', actions.openProjectPicker);
    issueAction('issues.cycle', 'Move to cycle…', 'shift+c', actions.openCyclePicker);
    command({
      id: 'issues.archive',
      title: 'Archive selected issues',
      keys: [key('mod+backspace')],
      visible: onTeam,
      enabled: needsTarget,
      run: () => actions.archiveTargets()
    });
    command({
      id: 'issues.clearSelection',
      title: 'Clear selection',
      keywords: ['deselect'],
      // Escape clears only on a team view with no peek open: the peek's
      // own Escape closes it first.
      keys: [key('escape', () => onTeam() && actions.peekId() === null)],
      visible: () => this.selection.hasSelection(),
      run: () => this.selection.clear()
    });
    command({
      id: 'issues.toggleArchived',
      title: 'Toggle archived issues',
      keywords: ['show', 'hidden'],
      visible: onTeam,
      run: () => this.viewOptions.toggleShowArchived()
    });

    // Navigation and help.
    command({ id: 'nav.search', title: 'Search…', keywords: ['find'], keys: [key('mod+/')], run: () => this.search.open() });
    command({
      id: 'nav.inbox',
      title: 'Go to inbox',
      keywords: ['notifications'],
      run: () => this.router.navigate('inbox')
    });
    command({ id: 'nav.myIssues', title: 'Go to my issues', run: () => this.router.navigate('myIssues') });
    command({ id: 'nav.team', title: 'Go to team…', keywords: ['switch'], run: () => actions.openTeamNavPicker() });
    command({ id: 'nav.project', title: 'Go to project…', run: () => actions.openProjectNavPicker() });
    command({
      id: 'views.save',
      title: 'Save current filters as view…',
      keywords: ['filter'],
      visible: onTeam,
      enabled: () => (this.viewOptions.hasFilters() ? true : { reason: 'Add a filter first' }),
      run: () => actions.openSaveViewDialog()
    });
    command({
      id: 'help.shortcuts',
      title: 'Keyboard shortcuts',
      keywords: ['help', 'keys'],
      keys: [key('shift+?')],
      run: () => this.dialogs.open(SHORTCUTS_DIALOG_ID)
    });

    // The `g` sequence stays hand-rolled until KeyboardService owns
    // multi-step keys: `g` arms it, `i` or `m` right after navigates.
    const bind = (id: string, combo: string, run: () => void, when: () => boolean, description: string) =>
      this.addCleanup(this.keyboard.register({ id, key: combo, run: () => run(), when, description }));
    bind('tracker.go.arm', 'g', () => this.armChord(), noOverlay, 'Go to… (then i/m)');
    bind(
      'tracker.go.inbox',
      'i',
      () => this.router.navigate('inbox'),
      () => noOverlay() && this.chordArmed(),
      'Go to inbox (after g)'
    );
    bind(
      'tracker.go.myIssues',
      'm',
      () => this.router.navigate('myIssues'),
      () => noOverlay() && this.chordArmed(),
      'Go to my issues (after g)'
    );
  }

  protected override onDestroy(): void {
    this.cancelChordTimer.get()?.();
    this.cancelChordTimer.set(undefined);
  }
}
