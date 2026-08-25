/**
 * Component-facing issue interaction surface.
 *
 * This class intentionally owns no domain behavior. Bounded services own
 * targets, properties, movement, selection/composer flows, detail flows,
 * saved-view navigation, and global registrations. Components keep one small
 * connection dependency while each feature has an independent implementation
 * and test seam.
 */
import { Service, type ServiceContext } from 'wheel/core';

import { IssueCommandService } from './issue-command-service';
import { IssueDetailInteractionService } from './issue-detail-interaction-service';
import {
  COMPOSER_DIALOG_ID,
  SAVE_VIEW_DIALOG_ID,
  SHORTCUTS_DIALOG_ID,
  type RowClickModifiers
} from './issue-interaction-contract';
import { IssueMovementService } from './issue-movement-service';
import {
  IssuePropertyService,
  type FilterPickerKind,
  type PropertyPickerKind
} from './issue-property-service';
import { IssueSelectionInteractionService } from './issue-selection-interaction-service';
import { IssueTargetService } from './issue-target-service';
import { IssueViewNavigationService } from './issue-view-navigation-service';

export {
  COMPOSER_DIALOG_ID,
  SAVE_VIEW_DIALOG_ID,
  SHORTCUTS_DIALOG_ID
};
export type {
  FilterPickerKind,
  PropertyPickerKind,
  RowClickModifiers
};

/** Stable component API composed from bounded interaction services. */
export class IssueInteractionService extends Service {
         /** Identity that survives minification (see require-service-name). */
         static override serviceName = 'IssueInteractionService';

  private readonly targetsService = this.service(IssueTargetService);
  private readonly properties = this.service(IssuePropertyService);
  private readonly movement = this.service(IssueMovementService);
  private readonly selectionFlow = this.service(
    IssueSelectionInteractionService
  );
  private readonly details = this.service(IssueDetailInteractionService);
  private readonly viewNavigation = this.service(
    IssueViewNavigationService
  );
  private readonly commands = this.service(IssueCommandService);

  readonly editingId = this.selectionFlow.editingId;
  readonly peekId = this.selectionFlow.peekId;
  readonly currentTeamId = this.targetsService.currentTeamId;
  readonly targets = this.targetsService.targets;

  readonly rowClick = this.selectionFlow.rowClick;
  readonly beginEdit = this.selectionFlow.beginEdit;
  readonly commitEdit = this.selectionFlow.commitEdit;
  readonly cancelEdit = this.selectionFlow.cancelEdit;
  readonly archiveTargets = this.selectionFlow.archiveTargets;
  readonly unarchiveTargets = this.selectionFlow.unarchiveTargets;
  readonly deleteTargets = this.selectionFlow.deleteTargets;
  readonly openPeek = this.selectionFlow.openPeek;
  readonly closePeek = this.selectionFlow.closePeek;
  readonly openFull = this.selectionFlow.openFull;
  readonly focusIssue = this.selectionFlow.focusIssue;
  readonly openComposer = this.selectionFlow.openComposer;
  readonly closeComposer = this.selectionFlow.closeComposer;
  readonly submitComposer = this.selectionFlow.submitComposer;

  readonly openStatusPicker = this.properties.openStatusPicker;
  readonly openPriorityPicker = this.properties.openPriorityPicker;
  readonly openAssigneePicker = this.properties.openAssigneePicker;
  readonly openLabelPicker = this.properties.openLabelPicker;
  readonly openProjectPicker = this.properties.openProjectPicker;
  readonly openCyclePicker = this.properties.openCyclePicker;
  readonly openEstimatePicker = this.properties.openEstimatePicker;
  readonly openPropertyPicker = this.properties.openPropertyPicker;
  readonly openFilterPicker = this.properties.openFilterPicker;

  readonly reorderCursor = this.movement.reorderCursor;
  readonly dropOnBoard = this.movement.dropOnBoard;
  readonly boardMoveCursor = this.movement.boardMoveCursor;
  readonly boardShiftColumn = this.movement.boardShiftColumn;

  readonly openTeamNavPicker = this.viewNavigation.openTeamNavPicker;
  readonly openProjectNavPicker =
    this.viewNavigation.openProjectNavPicker;
  readonly openSaveViewDialog =
    this.viewNavigation.openSaveViewDialog;
  readonly saveCurrentView = this.viewNavigation.saveCurrentView;
  readonly applyView = this.viewNavigation.applyView;
  readonly deleteView = this.viewNavigation.deleteView;

  readonly saveDescription = this.details.saveDescription;
  readonly saveDueDate = this.details.saveDueDate;
  readonly createSubIssue = this.details.createSubIssue;
  readonly openRelationPicker = this.details.openRelationPicker;
  readonly openParentPicker = this.details.openParentPicker;
  readonly deleteProject = this.details.deleteProject;

  constructor(context: ServiceContext) {
    super(context);
    this.commands.install({
      currentTeamId: this.currentTeamId,
      peekId: () => this.peekId.get(),
      hasTarget: () => this.targets().length > 0,
      moveCursor: this.movement.moveCursor,
      extendCursor: this.movement.extendCursor,
      boardMoveCursor: this.boardMoveCursor,
      boardShiftColumn: this.boardShiftColumn,
      toggleCursorSelection: this.selectionFlow.toggleCursorSelection,
      closePeek: this.closePeek,
      openPeek: this.openPeek,
      openFull: this.openFull,
      openStatusPicker: this.openStatusPicker,
      openAssigneePicker: this.openAssigneePicker,
      openPriorityPicker: this.openPriorityPicker,
      openLabelPicker: this.openLabelPicker,
      openProjectPicker: this.openProjectPicker,
      openCyclePicker: this.openCyclePicker,
      beginEdit: this.beginEdit,
      reorderCursor: this.reorderCursor,
      archiveTargets: this.archiveTargets,
      openComposer: this.openComposer,
      openTeamNavPicker: this.openTeamNavPicker,
      openProjectNavPicker: this.openProjectNavPicker,
      openSaveViewDialog: this.openSaveViewDialog
    });
  }
}
