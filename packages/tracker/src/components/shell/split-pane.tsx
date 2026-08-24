/**
 * The secondary split-view pane — the `inheritServices: 'live'`
 * proof. Everything SYNCED (IssueService, ViewService…) resolves through the
 * parent scope and is shared; every PLAIN service (ViewOptions, Selection,
 * Picker, the interaction facade) constructs fresh inside this scope — so
 * this pane has its own filters, its own selection, its own pickers, while
 * both panes converge on the same live data.
 *
 * The PaneService override tells the scoped interaction facade it is NOT the
 * primary pane, so it skips keyboard/palette registration (mouse still works
 * here; the keyboard belongs to the primary pane).
 */
import { ServiceProvider, fakeService, viewRoot } from 'wheel/core';

import { PaneService } from '../../services/pane-service';
import { FilterBar } from '../list/filter-bar';
import { IssueList } from '../list/issue-list';
import { PickerOverlay } from '../common/picker-overlay';
import styles from './split-pane.module.css';

/** A second, scope-isolated issue list for another (or the same) team. */
export function SplitPane(props: { teamId: string; onClose: () => void }) {
  const secondary = fakeService(PaneService, {
    isPrimary: (() => false) as PaneService['isPrimary']
  });
  return (
    <aside use:viewRoot={{ name: 'SplitPane', props }} class={styles.pane}>
      <ServiceProvider
        scopeId="pane:secondary"
        inheritServices="live"
        overrides={[{ original: PaneService, replacement: secondary, ownership: 'caller' }]}
      >
        <div class={styles.header}>
          <span class={styles.label}>Split pane — own filters &amp; selection, same live data</span>
          <button class={styles.close} title="Close split" onClick={() => props.onClose()}>
            ✕
          </button>
        </div>
        <FilterBar />
        <IssueList teamId={props.teamId} />
        <PickerOverlay />
      </ServiceProvider>
    </aside>
  );
}
