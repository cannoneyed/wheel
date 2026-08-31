/**
 * Projects sync module. Projects are workspace-level (issues from any
 * team can join one). Progress comes from `project_counts` — a derived collection:
 * no physical table or touch trigger; its query re-runs through its
 * dependencies (`issues`, `workflow_states`), which is the engine's derived-
 * derived-collection seam getting its first real consumer.
 */
import { mutation, patchMutation, query, t, collection, type Infer, type InverseSpec } from 'wheel/sync';

/** One project. `statusKind` is the project lifecycle, not a workflow state. */
export const ProjectRow = t.object({
  id: t.string(),
  name: t.string(),
  description: t.string(),
  statusKind: t.enum(['backlog', 'planned', 'started', 'paused', 'completed', 'canceled']),
  leadId: t.string().nullable(),
  /** ISO date (YYYY-MM-DD) or null. */
  targetDate: t.string().nullable(),
  position: t.number()
});

/** The projects collection. */
export const projects = collection({ name: 'projects', type: ProjectRow, key: (row) => row.id });

/** Derived per-project progress. VIRTUAL — never written, only computed. */
export const ProjectCountsRow = t.object({
  projectId: t.string(),
  total: t.number(),
  completed: t.number()
});

/** Project counts derived from projects and issues. */
export const projectCounts = collection({
  name: 'project_counts',
  type: ProjectCountsRow,
  key: (row) => row.projectId,
  keySpec: { fields: ['projectId'] }
});

/** Every project, in sidebar order. */
export const projectsAll = query({
  name: 'projects.all',
  params: t.object({}),
  into: projects,
  projection: {
    filter: () => true,
    sort: (a, b) => a.position - b.position || (a.id < b.id ? -1 : 1)
  }
});

/** Progress counts for every project. No projection — derived rows are server-computed only. */
export const projectCountsAll = query({
  name: 'project_counts.all',
  params: t.object({}),
  into: projectCounts,
  dependsOn: ['issues', 'workflow_states']
});

/** The editable project fields (shared by update's patch). */
export const ProjectPatch = t.object({
  name: t.string().optional(),
  description: t.string().optional(),
  statusKind: t.enum(['backlog', 'planned', 'started', 'paused', 'completed', 'canceled']).optional(),
  leadId: t.string().nullable().optional(),
  targetDate: t.string().nullable().optional()
});

/** Create a project (id args-borne). Inverse: delete it. */
export const projectCreate = mutation({
  name: 'projects.create',
  args: t.object({
    projectId: t.string(),
    name: t.string(),
    description: t.string(),
    leadId: t.string().nullable(),
    targetDate: t.string().nullable(),
    position: t.number()
  }),
  optimistic: (cache, args) => {
    const row: Project = {
      id: args.projectId,
      name: args.name,
      description: args.description,
      statusKind: 'planned',
      leadId: args.leadId,
      targetDate: args.targetDate,
      position: args.position
    };
    cache.put(projects, row);
  },
  invert: (_reader, args): InverseSpec => ({
    mutation: projectDelete,
    args: { projectId: args.projectId },
    description: 'create project'
  })
});

/** Patch a project. Inverse: prior values back. */
export const projectUpdate = patchMutation({
  name: 'projects.update',
  args: t.object({ projectId: t.string(), patch: ProjectPatch }),
  collection: projects,
  id: (args) => args.projectId,
  description: 'edit project'
});

/**
 * Delete a project; its issues are unassigned server-side. Inverse: re-create
 * the project row (issue assignments are NOT restored — the confirm dialog
 * says so; same partial-restore honesty as the soft-delete doctrine).
 */
export const projectDelete = mutation({
  name: 'projects.delete',
  args: t.object({ projectId: t.string() }),
  optimistic: (cache, args) => {
    cache.delete(projects, args.projectId);
  },
  invert: (reader, args): InverseSpec | null => {
    const project = reader.get(projects, args.projectId);
    if (!project) return null;
    return {
      mutation: projectCreate,
      args: {
        projectId: project.id,
        name: project.name,
        description: project.description,
        leadId: project.leadId,
        targetDate: project.targetDate,
        position: project.position
      },
      description: 'delete project'
    };
  }
});

/** Project type alias. */
export type Project = Infer<typeof ProjectRow>;
/** Project-progress row alias. */
export type ProjectCounts = Infer<typeof ProjectCountsRow>;
