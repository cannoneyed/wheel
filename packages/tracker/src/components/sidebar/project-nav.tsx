/**
 * The sidebar's Projects section — split from Sidebar when its connect hit
 * the max-connect-surface service cap (the rule working as intended: split,
 * don't pragma).
 */
import { For } from 'solid-js';
import { componentRoot, connect, view } from 'wheel/core';

import { ProjectService } from '../../services/project-service';
import type { RouterService } from 'wheel/router';

import { trackerRouter, type TrackerRoutes } from '../../routes';
import styles from './sidebar.module.css';

const connectProjectNav = connect('ProjectNav', (c) => {
  const projectService = c.service(ProjectService);
  const router = c.service(trackerRouter.Service) as RouterService<TrackerRoutes>;
  return view(
    {
      projects: projectService.projects,
      projectId: () => router.matchOf('project')?.params.projectId ?? null
    },
    { navigate: router.navigate }
  );
});

/** Project links in the sidebar. */
export function ProjectNav() {
  const state = connectProjectNav({});
  return (
    <div use:componentRoot class={styles.section}>
      <div class={styles.sectionLabel}>Projects</div>
      <For each={state.projects.rows}>
        {(project) => (
          <button
            class={
              state.projectId === project.id
                ? `${styles.item} ${styles.itemActive}`
                : styles.item
            }
            onClick={() => state.navigate('project', { params: { projectId: project.id } })}
          >
            <span class={styles.teamIcon}>▣</span>
            {project.name}
          </button>
        )}
      </For>
    </div>
  );
}
