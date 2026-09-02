import { Service } from 'wheel/core';
import {
  CommandPaletteService,
  DialogService,
  KeyboardService
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

/** Owns Tracker's one global shortcut and command registration table. */
export class IssueCommandService extends Service {
  /** Identity that survives minification (see require-service-name). */
  static override serviceName = 'IssueCommandService';

  private readonly keyboard = this.service(KeyboardService);
  private readonly palette = this.service(CommandPaletteService);
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
    const bind = (
      id: string,
      key: string,
      run: () => void,
      when: () => boolean,
      description?: string
    ) =>
      this.addCleanup(
        this.keyboard.register({
          id,
          key,
          run: () => run(),
          when,
          description
        })
      );

    bind(
      'tracker.list.next',
      'arrowdown',
      () => actions.moveCursor(1),
      () => onList() && noOverlay(),
      'Next issue'
    );
    bind(
      'tracker.list.nextVim',
      'j',
      () => actions.moveCursor(1),
      () => onList() && noOverlay(),
      'Next issue'
    );
    bind(
      'tracker.list.previous',
      'arrowup',
      () => actions.moveCursor(-1),
      () => onList() && noOverlay(),
      'Previous issue'
    );
    bind(
      'tracker.list.previousVim',
      'k',
      () => actions.moveCursor(-1),
      () => onList() && noOverlay(),
      'Previous issue'
    );
    bind(
      'tracker.list.extendDown',
      'shift+arrowdown',
      () => actions.extendCursor(1),
      () => onList() && noOverlay(),
      'Extend selection down'
    );
    bind(
      'tracker.list.extendUp',
      'shift+arrowup',
      () => actions.extendCursor(-1),
      () => onList() && noOverlay(),
      'Extend selection up'
    );
    bind(
      'tracker.board.down',
      'arrowdown',
      () => actions.boardMoveCursor(0, 1),
      () => onBoard() && noOverlay(),
      'Next card in column'
    );
    bind(
      'tracker.board.up',
      'arrowup',
      () => actions.boardMoveCursor(0, -1),
      () => onBoard() && noOverlay(),
      'Previous card in column'
    );
    bind(
      'tracker.board.left',
      'arrowleft',
      () => actions.boardMoveCursor(-1, 0),
      () => onBoard() && noOverlay(),
      'Column left'
    );
    bind(
      'tracker.board.right',
      'arrowright',
      () => actions.boardMoveCursor(1, 0),
      () => onBoard() && noOverlay(),
      'Column right'
    );
    bind(
      'tracker.board.shiftLeft',
      'alt+arrowleft',
      () => actions.boardShiftColumn(-1),
      () => onBoard() && noOverlay(),
      'Move card one column left'
    );
    bind(
      'tracker.board.shiftRight',
      'alt+arrowright',
      () => actions.boardShiftColumn(1),
      () => onBoard() && noOverlay(),
      'Move card one column right'
    );
    bind(
      'tracker.selection.toggle',
      'x',
      actions.toggleCursorSelection,
      () => (onList() || onBoard()) && noOverlay(),
      'Select issue'
    );
    bind(
      'tracker.peek.close',
      'escape',
      actions.closePeek,
      () => noOverlay() && actions.peekId() !== null,
      'Close peek'
    );
    bind(
      'tracker.selection.clear',
      'escape',
      this.selection.clear,
      () =>
        onTeam() &&
        noOverlay() &&
        actions.peekId() === null &&
        this.selection.hasSelection()
    );
    bind(
      'tracker.issue.peek',
      'space',
      () => actions.openPeek(cursor()),
      () =>
        (onList() || onBoard()) && noOverlay() && cursor() !== null,
      'Peek issue'
    );
    bind(
      'tracker.issue.open',
      'enter',
      () => actions.openFull(cursor()),
      () =>
        (onList() || onBoard()) && noOverlay() && cursor() !== null,
      'Open issue'
    );
    bind(
      'tracker.issue.status',
      's',
      actions.openStatusPicker,
      () => onIssues() && noOverlay() && actions.hasTarget(),
      'Change status'
    );
    bind(
      'tracker.issue.assign',
      'a',
      actions.openAssigneePicker,
      () => onIssues() && noOverlay() && actions.hasTarget(),
      'Assign'
    );
    bind(
      'tracker.issue.priority',
      'p',
      actions.openPriorityPicker,
      () => onIssues() && noOverlay() && actions.hasTarget(),
      'Set priority'
    );
    bind(
      'tracker.issue.labels',
      'l',
      actions.openLabelPicker,
      () => onIssues() && noOverlay() && actions.hasTarget(),
      'Change labels'
    );
    bind(
      'tracker.issue.project',
      'shift+p',
      actions.openProjectPicker,
      () => onIssues() && noOverlay() && actions.hasTarget(),
      'Move to project'
    );
    bind(
      'tracker.issue.cycle',
      'shift+c',
      actions.openCyclePicker,
      () => onIssues() && noOverlay() && actions.hasTarget(),
      'Move to cycle'
    );
    bind(
      'tracker.search.open',
      'mod+/',
      this.search.open,
      noOverlay,
      'Search'
    );
    bind(
      'tracker.shortcuts.open',
      'shift+?',
      () => this.dialogs.open(SHORTCUTS_DIALOG_ID),
      noOverlay,
      'Keyboard shortcuts'
    );
    bind(
      'tracker.go.arm',
      'g',
      () => this.armChord(),
      noOverlay,
      'Go to… (then i/m)'
    );
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
    bind(
      'tracker.issue.edit',
      'e',
      () => actions.beginEdit(),
      () => onList() && noOverlay() && cursor() !== null,
      'Edit title'
    );
    bind(
      'tracker.list.reorderDown',
      'alt+arrowdown',
      () => actions.reorderCursor(1),
      () =>
        onList() &&
        noOverlay() &&
        this.viewOptions.ordering.get() === 'manual',
      'Move issue down'
    );
    bind(
      'tracker.list.reorderUp',
      'alt+arrowup',
      () => actions.reorderCursor(-1),
      () =>
        onList() &&
        noOverlay() &&
        this.viewOptions.ordering.get() === 'manual',
      'Move issue up'
    );
    bind(
      'tracker.issue.archive',
      'mod+backspace',
      actions.archiveTargets,
      () => onTeam() && noOverlay() && actions.hasTarget(),
      'Archive'
    );
    bind(
      'tracker.issue.create',
      'c',
      actions.openComposer,
      () => onTeam() && noOverlay(),
      'New issue'
    );

    const command = (
      id: string,
      title: string,
      run: () => void,
      when: () => boolean,
      keywords?: string[]
    ) =>
      this.addCleanup(
        this.palette.registerCommand({
          id,
          title,
          run,
          when,
          keywords
        })
      );
    command('issues.new', 'New issue', actions.openComposer, onTeam, [
      'create',
      'add'
    ]);
    command(
      'issues.status',
      'Change status…',
      actions.openStatusPicker,
      () => onTeam() && actions.hasTarget()
    );
    command(
      'issues.assign',
      'Assign…',
      actions.openAssigneePicker,
      () => onTeam() && actions.hasTarget()
    );
    command(
      'issues.priority',
      'Set priority…',
      actions.openPriorityPicker,
      () => onTeam() && actions.hasTarget()
    );
    command(
      'issues.labels',
      'Change labels…',
      actions.openLabelPicker,
      () => onTeam() && actions.hasTarget()
    );
    command(
      'issues.project',
      'Move to project…',
      actions.openProjectPicker,
      () => onIssues() && actions.hasTarget()
    );
    command(
      'issues.cycle',
      'Move to cycle…',
      actions.openCyclePicker,
      () => onIssues() && actions.hasTarget()
    );
    command(
      'issues.archive',
      'Archive selected issues',
      actions.archiveTargets,
      () => onTeam() && actions.hasTarget()
    );
    command(
      'issues.clearSelection',
      'Clear selection',
      this.selection.clear,
      this.selection.hasSelection,
      ['deselect']
    );
    command(
      'issues.toggleArchived',
      'Toggle archived issues',
      this.viewOptions.toggleShowArchived,
      onTeam,
      ['show', 'hidden']
    );
    command('nav.search', 'Search…', this.search.open, () => true, [
      'find'
    ]);
    command(
      'nav.inbox',
      'Go to inbox',
      () => this.router.navigate('inbox'),
      () => true,
      ['notifications']
    );
    command(
      'nav.myIssues',
      'Go to my issues',
      () => this.router.navigate('myIssues'),
      () => true
    );
    command(
      'nav.team',
      'Go to team…',
      actions.openTeamNavPicker,
      () => true,
      ['switch']
    );
    command(
      'nav.project',
      'Go to project…',
      actions.openProjectNavPicker,
      () => true
    );
    command(
      'views.save',
      'Save current filters as view…',
      actions.openSaveViewDialog,
      () => onTeam() && this.viewOptions.hasFilters(),
      ['filter']
    );
    command(
      'help.shortcuts',
      'Keyboard shortcuts',
      () => this.dialogs.open(SHORTCUTS_DIALOG_ID),
      () => true,
      ['help', 'keys']
    );
  }

  protected override onDestroy(): void {
    this.cancelChordTimer.get()?.();
    this.cancelChordTimer.set(undefined);
  }
}
