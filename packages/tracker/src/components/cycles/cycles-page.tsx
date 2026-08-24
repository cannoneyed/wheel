/**
 * The team cycles tab: one card per cycle with stats from the
 * VIRTUAL cycle_stats table, active/ended badges, and each cycle's issues
 * expandable below (click a row to peek).
 */
import { For, Show } from 'solid-js';
import { componentRoot, connect, useSignal, view } from 'wheel/core';

import { CycleService } from '../../services/cycle-service';
import { IssueService } from '../../services/issue-service';
import { IssueInteractionService } from '../../services/issue-interaction-service';
import styles from './cycles-page.module.css';

const connectCyclesPage = connect(
  (props: { teamId: string }) => `CyclesPage:${props.teamId}`,
  (c, props: { teamId: string }) => {
    const cycleService = c.service(CycleService);
    const issueService = c.service(IssueService);
    const interactionService = c.service(IssueInteractionService);
    return view(
      {
        cycles: () => cycleService.cyclesFor(props.teamId),
        activeId: () => cycleService.active(props.teamId)?.id ?? null
      },
      {
        label: (cycleId: string) => cycleService.label(props.teamId, cycleId),
        statsOf: (cycleId: string) => cycleService.statsOf(props.teamId, cycleId),
        ended: cycleService.ended,
        issuesOf: (cycleId: string) =>
          issueService.activeFor(props.teamId).filter((issue) => issue.cycleId === cycleId),
        openPeek: interactionService.openPeek
      }
    );
  }
);

/** The cycles tab for one team. */
export function CyclesPage(props: { teamId: string }) {
  const state = connectCyclesPage(props);
  const [openCycle, setOpenCycle] = useSignal<string | null>(null, 'openCycle');
  return (
    <div use:componentRoot class={styles.page}>
      <For each={state.cycles}>
        {(cycle) => {
          const stats = () => state.statsOf(cycle.id);
          const percent = () =>
            stats().scope === 0 ? 0 : Math.round((stats().completed / stats().scope) * 100);
          return (
            <section class={styles.card}>
              <button class={styles.cardHeader} onClick={() => setOpenCycle(openCycle() === cycle.id ? null : cycle.id)}>
                <span class={styles.cycleName}>{state.label(cycle.id)}</span>
                <Show when={state.activeId === cycle.id}>
                  <span class={styles.badgeActive}>active</span>
                </Show>
                <Show when={state.ended(cycle.endsAt) && state.activeId !== cycle.id}>
                  <span class={styles.badgeEnded}>ended</span>
                </Show>
                <span class={styles.spacer} />
                <span class={styles.stats}>
                  {stats().completed}/{stats().scope} done · {stats().started} in flight
                </span>
              </button>
              <div class={styles.progressBar}>
                <div class={styles.progressFill} style={{ width: `${percent()}%` }} />
              </div>
              <Show when={openCycle() === cycle.id}>
                <div class={styles.issues}>
                  <For each={state.issuesOf(cycle.id)}>
                    {(issue) => (
                      <button class={styles.row} onClick={() => state.openPeek(issue.id)}>
                        <span class={styles.title}>{issue.title}</span>
                      </button>
                    )}
                  </For>
                  <Show when={state.issuesOf(cycle.id).length === 0}>
                    <div class={styles.empty}>No issues scheduled.</div>
                  </Show>
                </div>
              </Show>
            </section>
          );
        }}
      </For>
      <Show when={state.cycles.length === 0}>
        <div class={styles.empty}>No cycles yet — the rollover job creates them.</div>
      </Show>
    </div>
  );
}
