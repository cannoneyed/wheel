/**
 * The project page: header with progress from the VIRTUAL
 * project_counts table, then the project's issues across teams. Rows are
 * intentionally lightweight (identifier + state dot + title + assignee) —
 * clicking peeks; the full property surface lives in the detail pane.
 */
import { For, Show, onCleanup } from 'solid-js';
import { componentRoot, connect, view } from 'wheel/core';

import { ProjectService } from '../../services/project-service';
import { TeamService } from '../../services/team-service';
import { IssueInteractionService } from '../../services/issue-interaction-service';
import { formatDueDate } from '../../utils/dates';
import { FavoriteStar } from '../common/favorite-star';
import styles from './project-page.module.css';

const connectProjectPage = connect(
  (props: { projectId: string }) => `ProjectPage:${props.projectId}`,
  (c, props: { projectId: string }) => {
    const projectService = c.service(ProjectService);
    const teamService = c.service(TeamService);
    const interactionService = c.service(IssueInteractionService);
    onCleanup(() => projectService.releaseIssues(props.projectId));
    return view(
      {
        project: () => projectService.project(props.projectId),
        progress: () => projectService.progress(props.projectId),
        lead: () => {
          const leadId = projectService.project(props.projectId)?.leadId;
          return leadId ? teamService.user(leadId) : undefined;
        },
        rows: () =>
          projectService.issuesOf(props.projectId).map((issue) => ({
            issue,
            teamKey: teamService.team(issue.teamId)?.key ?? '',
            stateColor:
              teamService.states(issue.teamId).find((state) => state.id === issue.stateId)?.color ??
              'var(--ink-muted)',
            assignee: issue.assigneeId ? teamService.user(issue.assigneeId) : undefined
          }))
      },
      {
        openPeek: interactionService.openPeek,
        deleteProject: (projectId: string) => void interactionService.deleteProject(projectId)
      }
    );
  }
);

/** One project's overview + issue list. */
export function ProjectPage(props: { projectId: string }) {
  const state = connectProjectPage(props);
  const percent = () =>
    state.progress.total === 0 ? 0 : Math.round((state.progress.completed / state.progress.total) * 100);
  return (
    <div use:componentRoot class={styles.page}>
      <Show when={state.project} fallback={<div class={styles.missing}>Project not found.</div>}>
        {(project) => (
          <>
            <header class={styles.header}>
              <h2 class={styles.name}>▣ {project().name}</h2>
              <FavoriteStar kind="project" targetId={props.projectId} />
              <span class={styles.status}>{project().statusKind}</span>
              <Show when={state.lead}>
                {(lead) => (
                  <span class={styles.lead}>
                    <span class={styles.avatar} style={{ background: lead().avatarColor }}>
                      {lead().initials}
                    </span>
                    {lead().name}
                  </span>
                )}
              </Show>
              <Show when={project().targetDate}>
                {(targetDate) => <span class={styles.target}>🎯 {formatDueDate(targetDate())}</span>}
              </Show>
              <span class={styles.spacer} />
              <button class={styles.delete} onClick={() => state.deleteProject(props.projectId)}>
                Delete…
              </button>
            </header>
            <div class={styles.progressRow}>
              <div class={styles.progressBar}>
                <div class={styles.progressFill} style={{ width: `${percent()}%` }} />
              </div>
              <span class={styles.progressText}>
                {state.progress.completed}/{state.progress.total} done · {percent()}%
              </span>
            </div>
            <div class={styles.list}>
              <For each={state.rows}>
                {(row) => (
                  <button class={styles.row} onClick={() => state.openPeek(row.issue.id)}>
                    <span class={styles.identifier}>
                      {row.teamKey}-{row.issue.number === 0 ? '…' : row.issue.number}
                    </span>
                    <span style={{ color: row.stateColor }}>●</span>
                    <span class={styles.title}>{row.issue.title}</span>
                    <Show when={row.assignee}>
                      {(assignee) => (
                        <span class={styles.avatar} style={{ background: assignee().avatarColor }}>
                          {assignee().initials}
                        </span>
                      )}
                    </Show>
                  </button>
                )}
              </For>
              <Show when={state.rows.length === 0}>
                <div class={styles.empty}>No issues in this project yet — assign some with shift+P.</div>
              </Show>
            </div>
          </>
        )}
      </Show>
    </div>
  );
}
