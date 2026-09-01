import { For, Show } from 'solid-js';
import { componentRoot, connect, view } from 'wheel/core';

import { RoundsService } from './rounds-service';

const connectRounds = connect('Rounds', (context) => {
  const rounds = context.service(RoundsService);
  return view(
    {
      sites: () => rounds.sites.rows,
      sitesStatus: () => rounds.sites.status.kind,
      checklists: () => rounds.checklists.rows,
      checklistsStatus: () => rounds.checklists.status.kind,
      selectedChecklist: rounds.selectedChecklist,
      items: rounds.items,
      itemsStatus: () => rounds.itemsStatus().kind,
      progress: () => rounds.progress.rows.at(0) ?? { total: 0, complete: 0 },
      progressStatus: () => rounds.progress.status.kind,
      connection: rounds.connection,
      queued: rounds.queued,
      pending: rounds.pending,
      mutationState: () => rounds.mutation()?.state ?? 'none',
      mutationMessage: () =>
        rounds.mutation()?.rejection?.message ?? rounds.mutation()?.error?.message ?? '',
      saveState: rounds.saveState
    },
    {
      selectChecklist: rounds.selectChecklist,
      setNote: rounds.setNote,
      setStatus: rounds.setStatus,
      completeChecklist: rounds.completeChecklist,
      archiveSite: rounds.archiveSite
    }
  );
});

/** Offline inspection app used by the Wheel durability browser proofs. */
export function App() {
  const state = connectRounds({});
  return (
    <main use:componentRoot>
      <header>
        <div>
          <p class="eyebrow">Rounds</p>
          <h1>{state.sites[0]?.name ?? 'Inspection unavailable'}</h1>
        </div>
        <div class="sync-panel">
          <strong data-testid="save-state">{state.saveState}</strong>
          <span data-testid="connection-state">{state.connection}</span>
          <span data-testid="outbox-state">pending {state.pending} · queued {state.queued}</span>
        </div>
      </header>

      <section class="status-grid" aria-label="Query status">
        <output data-testid="sites-status">sites: {state.sitesStatus}</output>
        <output data-testid="checklists-status">checklists: {state.checklistsStatus}</output>
        <output data-testid="items-status">items: {state.itemsStatus}</output>
        <output data-testid="progress-status">progress: {state.progressStatus}</output>
      </section>

      <section class="progress">
        <strong data-testid="progress-value">{state.progress.complete}/{state.progress.total} checked</strong>
        <button data-testid="archive-site" onClick={() => state.archiveSite()}>Archive site</button>
      </section>

      <nav aria-label="Inspection rounds">
        <For each={state.checklists}>
          {(checklist) => (
            <button
              data-testid={`checklist-${checklist.id}`}
              aria-current={state.selectedChecklist?.id === checklist.id ? 'page' : undefined}
              onClick={() => state.selectChecklist(checklist.id)}
            >
              {checklist.title} · {checklist.status}
            </button>
          )}
        </For>
      </nav>

      <section>
        <div class="round-heading">
          <h2>{state.selectedChecklist?.title ?? 'No round selected'}</h2>
          <button data-testid="complete-checklist" onClick={() => state.completeChecklist()}>Complete round</button>
        </div>
        <Show when={state.items.length > 0} fallback={<p data-testid="empty-items">No items in this round.</p>}>
          <div class="item-list">
            <For each={state.items}>
              {(item) => {
                let note!: HTMLInputElement;
                return (
                  <article data-testid={`item-${item.id}`}>
                    <div>
                      <strong>{item.label}</strong>
                      <span data-testid={`status-${item.id}`}>{item.status}</span>
                      <span data-testid={`revision-${item.id}`}>revision {item.revision}</span>
                    </div>
                    <div class="status-actions">
                      <button data-testid={`pass-${item.id}`} onClick={() => state.setStatus(item.id, 'passed')}>Pass</button>
                      <button data-testid={`fail-${item.id}`} onClick={() => state.setStatus(item.id, 'failed')}>Fail</button>
                    </div>
                    <input data-testid={`note-${item.id}`} ref={note} value={item.note} aria-label={`${item.label} note`} />
                    <button data-testid={`save-${item.id}`} onClick={() => state.setNote(item.id, note.value)}>Save note</button>
                  </article>
                );
              }}
            </For>
          </div>
        </Show>
      </section>

      <output data-testid="mutation-state">{state.mutationState}</output>
      <output data-testid="mutation-message">{state.mutationMessage}</output>
    </main>
  );
}
