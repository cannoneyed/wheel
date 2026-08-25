/**
 * Projects: subscriptions, progress from the project_counts VIRTUAL
 * table, and project mutations. Issue↔project assignment lives on
 * IssueService.update (it's an issue patch).
 */
import { SyncService, positionBetween, type Infer, type MutationHandle } from 'wheel/sync';
import {
  ProjectPatch,
  projectCountsAll,
  projectCreate,
  projectDelete,
  projectUpdate,
  projectsAll,
  type Project,
  type ProjectCounts
} from '../sync/projects.sync';
import { issuesByProject } from '../sync/issues.sync';
import type { Issue } from './issue-service';
import { ToastService } from 'wheel/kit';

/** The editable project fields. */
export type ProjectPatchArgs = Infer<typeof ProjectPatch>;

/** Owns project subscriptions, derived progress, and project mutations. */
export class ProjectService extends SyncService {
         /** Identity that survives minification (see require-service-name). */
         static override serviceName = 'ProjectService';

  private readonly toastService = this.service(ToastService);
  /** Every project in sidebar order — connect directly (`state.projects.rows`). */
  readonly projects = this.liveQuery(projectsAll, {});
  private readonly counts = this.liveQuery(projectCountsAll, {});
  private readonly issuesView = this.liveQueryFor(issuesByProject, (projectId: string) => ({ projectId }));

  /** One project by id. */
  readonly project = this.computedFor(
    (projectId: string): Project | undefined => this.projects.rows.find((row) => row.id === projectId),
    'project'
  );
  /** Progress from the derived `project_counts` collection. Zero until issues join. */
  readonly progress = this.computedFor((projectId: string): ProjectCounts => {
    return (
      this.counts.rows.find((row) => row.projectId === projectId) ?? {
        projectId,
        total: 0,
        completed: 0
      }
    );
  }, 'progress');
  /** A project's issues across teams (active first ordering comes from the query). */
  readonly issuesOf = this.computedFor(
    (projectId: string): readonly Issue[] =>
      this.issuesView(projectId).rows.filter((row) => row.archivedAt === null),
    'issuesOf'
  );

  /** Release a project issue query when its page unmounts. */
  readonly releaseIssues = (projectId: string): boolean => this.issuesView.release(projectId);

  private watch(handle: MutationHandle, verb: string): MutationHandle {
    void handle.settled.then((info) => {
      if (info.state === 'rejected' || info.state === 'orphaned' || info.state === 'failed') {
        this.toastService.flash(
          `project:${info.mutationId}`,
          info.rejection?.message ?? info.error?.message ?? `Could not ${verb}.`,
          'warn'
        );
      }
    });
    return handle;
  }

  /** Create a project at the end of the sidebar order. Returns its args-borne id. */
  readonly create = (draft: { name: string; description?: string; leadId?: string | null; targetDate?: string | null }): string => {
    const projectId = this.client.newId('project');
    const last = this.projects.rows.at(-1);
    this.watch(
      this.mutate(projectCreate, {
        projectId,
        name: draft.name,
        description: draft.description ?? '',
        leadId: draft.leadId ?? null,
        targetDate: draft.targetDate ?? null,
        position: positionBetween(last?.position, undefined)
      }),
      'create the project'
    );
    return projectId;
  };

  /** Patch a project. */
  readonly update = (projectId: string, patch: ProjectPatchArgs) =>
    this.watch(this.mutate(projectUpdate, { projectId, patch }), 'update the project');

  /** Delete a project (issues are unassigned; the UI confirms first). */
  readonly remove = (projectId: string) =>
    this.watch(this.mutate(projectDelete, { projectId }), 'delete the project');
}

// Re-exported so components can import row types from the service layer.
export type { Project, ProjectCounts };
