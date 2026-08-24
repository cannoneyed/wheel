/**
 * The filter/display bar: filter chips open the multi pickers,
 * ordering and display toggles apply instantly. Chips show live counts —
 * names resolve inside the pickers themselves.
 */
import { Show } from 'solid-js';
import { componentRoot, connect, view } from 'wheel/core';

import { ViewOptionsService, type IssueOrdering } from '../../services/view-options-service';
import { IssueInteractionService } from '../../services/issue-interaction-service';
import styles from './filter-bar.module.css';

const connectFilterBar = connect('FilterBar', (c) => {
  const viewOptions = c.service(ViewOptionsService);
  const interactionService = c.service(IssueInteractionService);
  return view(
    {
      stateCount: () => viewOptions.states.get().size,
      priorityCount: () => viewOptions.priorities.get().size,
      assigneeCount: () => viewOptions.assignees.get().size,
      labelCount: () => viewOptions.labels.get().size,
      projectCount: () => viewOptions.projectsFilter.get().size,
      cycleCount: () => viewOptions.cyclesFilter.get().size,
      hasFilters: viewOptions.hasFilters,
      ordering: viewOptions.ordering,
      showArchived: viewOptions.showArchived,
      showEmpty: viewOptions.showEmptyGroups
    },
    {
      openFilter: interactionService.openFilterPicker,
      saveView: interactionService.openSaveViewDialog,
      setOrdering: viewOptions.setOrdering,
      toggleShowArchived: viewOptions.toggleShowArchived,
      toggleShowEmpty: viewOptions.toggleShowEmpty,
      clearFilters: viewOptions.clearFilters
    }
  );
});

function chipLabel(name: string, count: number): string {
  return count > 0 ? `${name} (${count})` : name;
}

/** The bar above the list/board. */
export function FilterBar() {
  const state = connectFilterBar({});
  return (
    <div use:componentRoot class={styles.bar}>
      <button
        class={styles.chip}
        classList={{ [styles.chipOn]: state.stateCount > 0 }}
        onClick={() => state.openFilter('status')}
      >
        {chipLabel('Status', state.stateCount)}
      </button>
      <button
        class={styles.chip}
        classList={{ [styles.chipOn]: state.priorityCount > 0 }}
        onClick={() => state.openFilter('priority')}
      >
        {chipLabel('Priority', state.priorityCount)}
      </button>
      <button
        class={styles.chip}
        classList={{ [styles.chipOn]: state.assigneeCount > 0 }}
        onClick={() => state.openFilter('assignee')}
      >
        {chipLabel('Assignee', state.assigneeCount)}
      </button>
      <button
        class={styles.chip}
        classList={{ [styles.chipOn]: state.labelCount > 0 }}
        onClick={() => state.openFilter('label')}
      >
        {chipLabel('Label', state.labelCount)}
      </button>
      <button
        class={styles.chip}
        classList={{ [styles.chipOn]: state.projectCount > 0 }}
        onClick={() => state.openFilter('project')}
      >
        {chipLabel('Project', state.projectCount)}
      </button>
      <button
        class={styles.chip}
        classList={{ [styles.chipOn]: state.cycleCount > 0 }}
        onClick={() => state.openFilter('cycle')}
      >
        {chipLabel('Cycle', state.cycleCount)}
      </button>
      <Show when={state.hasFilters}>
        <button class={styles.clear} onClick={() => state.clearFilters()}>
          Clear
        </button>
        <button class={styles.clear} title="Save current filters as a view" onClick={() => state.saveView()}>
          Save view
        </button>
      </Show>
      <span class={styles.spacer} />
      <select
        class={styles.ordering}
        value={state.ordering}
        onChange={(event) => state.setOrdering(event.currentTarget.value as IssueOrdering)}
      >
        <option value="manual">Manual order</option>
        <option value="priority">Priority</option>
        <option value="updated">Last updated</option>
        <option value="created">Newest</option>
      </select>
      <button class={styles.chip} classList={{ [styles.chipOn]: state.showEmpty }} onClick={() => state.toggleShowEmpty()}>
        Empty groups
      </button>
      <button
        class={styles.chip}
        classList={{ [styles.chipOn]: state.showArchived }}
        onClick={() => state.toggleShowArchived()}
      >
        Archived
      </button>
    </div>
  );
}
