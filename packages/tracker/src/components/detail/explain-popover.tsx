/**
 * The provenance receipt: "Why does this issue look like this?"
 * Renders `client.explain(issues, id)` — the current value's last
 * cause plus the full local write history — as product UI, not a debug tool.
 */
import { For, Show } from 'solid-js';
import { componentRoot, connect, systemClock, useSignal, view } from 'wheel/core';
import { type WriteCause } from 'wheel/sync';

import { IssueService } from '../../services/issue-service';
import { formatRelativeTime } from '../../utils/dates';
import styles from './explain-popover.module.css';

const connectExplainPopover = connect(
  (props: { issueId: string }) => `ExplainPopover:${props.issueId}`,
  (c, props: { issueId: string }) => {
    const issueService = c.service(IssueService);
    return view({ explain: () => issueService.explainIssue(props.issueId) });
  }
);

const CAUSE_LABELS: Record<string, string> = {
  bootstrap: 'loaded from the server snapshot',
  'sync-apply': 'confirmed by the server',
  optimistic: 'your local edit (awaiting confirm)',
  rollback: 'rolled back after a rejection',
  orphaned: 'dropped — the row disappeared',
  hydrate: 'restored from this device’s cache'
};

function causeLabel(cause: WriteCause | undefined): string {
  if (!cause) return 'no local history';
  const base = CAUSE_LABELS[cause.kind] ?? cause.kind;
  return 'mutation' in cause ? `${base} · ${cause.mutation}` : base;
}

/** The ⓘ button + popover. */
export function ExplainPopover(props: { issueId: string }) {
  const state = connectExplainPopover(props);
  const [open, setOpen] = useSignal(false, 'open');
  return (
    <span use:componentRoot class={styles.wrapper}>
      <button class={styles.trigger} title="Why does this issue look like this?" onClick={() => setOpen(!open())}>
        ⓘ
      </button>
      <Show when={open()}>
        <div class={styles.popover}>
          <div class={styles.title}>Provenance — issues.row({props.issueId.slice(0, 14)}…)</div>
          <div class={styles.cause}>Latest: {causeLabel(state.explain.cause)}</div>
          <div class={styles.historyLabel}>This tab’s write history ({state.explain.history.length})</div>
          <div class={styles.history}>
            <For each={[...state.explain.history].reverse()}>
              {(entry) => (
                <div class={styles.entry}>
                  <span class={`${styles.kind} ${styles[`kind_${entry.cause.kind.replace('-', '_')}`] ?? ''}`}>
                    {entry.cause.kind}
                  </span>
                  <span class={styles.entryText}>{causeLabel(entry.cause)}</span>
                  <span class={styles.time}>{formatRelativeTime(entry.at, systemClock.now())}</span>
                </div>
              )}
            </For>
            <Show when={state.explain.history.length === 0}>
              <div class={styles.empty}>No writes recorded in this tab yet.</div>
            </Show>
          </div>
        </div>
      </Show>
    </span>
  );
}
