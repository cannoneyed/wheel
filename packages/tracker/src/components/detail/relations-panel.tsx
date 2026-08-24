/**
 * Relations section: blocks / blocked-by / relates / duplicate,
 * with add-pickers and one-click removal (undoable).
 */
import { For, Show } from 'solid-js';
import { componentRoot, connect, view } from 'wheel/core';

import { IssueService } from '../../services/issue-service';
import { IssueInteractionService } from '../../services/issue-interaction-service';
import styles from './relations-panel.module.css';

interface RelationVm {
  readonly relationId: string;
  readonly label: string;
  readonly targetId: string;
  readonly targetTitle: string;
}

const connectRelationsPanel = connect(
  (props: { teamId: string; issueId: string }) => `RelationsPanel:${props.issueId}`,
  (c, props: { teamId: string; issueId: string }) => {
    const issueService = c.service(IssueService);
    const interactionService = c.service(IssueInteractionService);
    return view(
      {
        relations: (): readonly RelationVm[] =>
          issueService.relationsOf(props.teamId, props.issueId).map((relation) => {
            const outgoing = relation.issueId === props.issueId;
            const targetId = outgoing ? relation.relatedId : relation.issueId;
            const labels: Record<string, [string, string]> = {
              blocks: ['blocks', 'blocked by'],
              relates: ['relates to', 'relates to'],
              duplicate: ['duplicate of', 'duplicated by']
            };
            return {
              relationId: relation.id,
              label: labels[relation.kind][outgoing ? 0 : 1],
              targetId,
              targetTitle: issueService.issue(props.teamId, targetId)?.title ?? targetId
            };
          })
      },
      {
        openRelationPicker: interactionService.openRelationPicker,
        openPeek: interactionService.openPeek,
        remove: issueService.removeRelation
      }
    );
  }
);

/** The relations block. */
export function RelationsPanel(props: { teamId: string; issueId: string }) {
  const state = connectRelationsPanel(props);
  return (
    <section use:componentRoot class={styles.section}>
      <header class={styles.header}>
        <span class={styles.heading}>Relations</span>
        <span class={styles.spacer} />
        <button class={styles.add} onClick={() => state.openRelationPicker(props.issueId, 'blocks')}>
          + Blocks
        </button>
        <button class={styles.add} onClick={() => state.openRelationPicker(props.issueId, 'blocked-by')}>
          + Blocked by
        </button>
        <button class={styles.add} onClick={() => state.openRelationPicker(props.issueId, 'relates')}>
          + Related
        </button>
      </header>
      <Show when={state.relations.length > 0}>
        <For each={state.relations}>
          {(relation) => (
            <div class={styles.relation}>
              <span class={styles.kind}>{relation.label}</span>
              <button class={styles.target} onClick={() => state.openPeek(relation.targetId)}>
                {relation.targetTitle}
              </button>
              <button class={styles.remove} title="Remove relation" onClick={() => state.remove(relation.relationId)}>
                ✕
              </button>
            </div>
          )}
        </For>
      </Show>
    </section>
  );
}
