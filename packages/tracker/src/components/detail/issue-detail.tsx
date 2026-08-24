/**
 * The issue detail core: one component, two mounts — the peek pane
 * (aside on the team page) and the full page. Publishes viewing presence
 * while mounted; property edits ride the same pickers as the list.
 */
import { For, Show, createEffect, onCleanup } from 'solid-js';
import { componentRoot, connect, useSignal, view } from 'wheel/core';

import { ViewOptionsService } from '../../services/view-options-service';
import { IssueInteractionService } from '../../services/issue-interaction-service';
import { PresenceService } from '../../services/presence-service';
import { Markdown } from '../../utils/markdown';
import { PropertyPanel } from './property-panel';
import { SubIssues } from './sub-issues';
import { RelationsPanel } from './relations-panel';
import { ActivityFeed } from './activity-feed';
import { CommentList } from './comment-list';
import { ExplainPopover } from './explain-popover';
import { FavoriteStar } from '../common/favorite-star';
import styles from './issue-detail.module.css';

const connectIssueDetail = connect(
  (props: { teamId: string; issueId: string; mode: 'peek' | 'page' }) => `IssueDetail:${props.issueId}`,
  (c, props: { teamId: string; issueId: string; mode: 'peek' | 'page' }) => {
    const viewOptions = c.service(ViewOptionsService);
    const interactionService = c.service(IssueInteractionService);
    const presenceService = c.service(PresenceService);
    return view(
      {
        vm: () => viewOptions.issueVm(props.teamId, props.issueId),
        viewers: () => presenceService.viewerUsers(props.issueId),
        isEditingTitle: () => interactionService.editingId.get() === props.issueId
      },
      {
        beginEdit: interactionService.beginEdit,
        commitEdit: interactionService.commitEdit,
        cancelEdit: interactionService.cancelEdit,
        closePeek: interactionService.closePeek,
        openFull: interactionService.openFull,
        saveDescription: interactionService.saveDescription,
        focusIssue: interactionService.focusIssue,
        setViewing: presenceService.setViewing
      }
    );
  }
);

/** The detail surface for one issue. */
export function IssueDetail(props: { teamId: string; issueId: string; mode: 'peek' | 'page' }) {
  const state = connectIssueDetail(props);
  const [editingDescription, setEditingDescription] = useSignal(false, 'editingDescription');

  // subscription boundary: while this detail is mounted, this tab's presence
  // says "viewing this issue" (and the keyboard cursor follows on full page);
  // cleared on unmount / issue change.
  createEffect(() => {
    state.setViewing(props.issueId);
    if (props.mode === 'page') state.focusIssue(props.issueId);
    onCleanup(() => state.setViewing(null));
  });

  return (
    <div use:componentRoot class={styles.detail}>
      <Show when={state.vm} fallback={<div class={styles.missing}>Issue not found (it may have been deleted).</div>}>
        {(vm) => (
          <>
            <header class={styles.header}>
              <span class={styles.identifier}>
                {vm().teamKey}-{vm().issue.number === 0 ? '…' : vm().issue.number}
              </span>
              <span class={styles.viewerRow}>
                <For each={state.viewers}>
                  {(user) => (
                    <span class={styles.viewer} title={`${user.name} is viewing`} style={{ background: user.avatarColor }}>
                      {user.initials}
                    </span>
                  )}
                </For>
              </span>
              <FavoriteStar kind="issue" targetId={props.issueId} />
              <ExplainPopover issueId={props.issueId} />
              <Show when={props.mode === 'peek'}>
                <button class={styles.headerButton} title="Open full page (enter)" onClick={() => state.openFull(props.issueId)}>
                  ⤢
                </button>
                <button class={styles.headerButton} title="Close (esc)" onClick={() => state.closePeek()}>
                  ✕
                </button>
              </Show>
            </header>

            <Show
              when={state.isEditingTitle}
              fallback={
                <h2 class={styles.title} onDblClick={() => state.beginEdit(props.issueId)}>
                  {vm().issue.title}
                </h2>
              }
            >
              <input
                class={styles.titleInput}
                value={vm().issue.title}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') state.commitEdit(event.currentTarget.value);
                  else if (event.key === 'Escape') state.cancelEdit();
                }}
                onBlur={(event) => state.commitEdit(event.currentTarget.value)}
                ref={(element) => {
                  // dom boundary: the edit input just mounted; focus + select.
                  queueMicrotask(() => {
                    element.focus();
                    element.select();
                  });
                }}
              />
            </Show>

            <PropertyPanel teamId={props.teamId} issueId={props.issueId} />

            <section class={styles.section}>
              <Show
                when={editingDescription()}
                fallback={
                  <div class={styles.description} onDblClick={() => setEditingDescription(true)}>
                    <Show
                      when={vm().issue.description !== ''}
                      fallback={<span class={styles.placeholder}>Add a description… (double-click)</span>}
                    >
                      <Markdown source={vm().issue.description} class={styles.markdown} />
                    </Show>
                  </div>
                }
              >
                <textarea
                  class={styles.descriptionInput}
                  rows={6}
                  value={vm().issue.description}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                      state.saveDescription(props.issueId, event.currentTarget.value);
                      setEditingDescription(false);
                    } else if (event.key === 'Escape') {
                      setEditingDescription(false);
                    }
                  }}
                  onBlur={(event) => {
                    state.saveDescription(props.issueId, event.currentTarget.value);
                    setEditingDescription(false);
                  }}
                  ref={(element) => {
                    // dom boundary: editor just opened; put the caret in it.
                    queueMicrotask(() => element.focus());
                  }}
                />
              </Show>
            </section>

            <SubIssues teamId={props.teamId} issueId={props.issueId} />
            <RelationsPanel teamId={props.teamId} issueId={props.issueId} />
            <ActivityFeed teamId={props.teamId} issueId={props.issueId} />
            <CommentList teamId={props.teamId} issueId={props.issueId} />
          </>
        )}
      </Show>
    </div>
  );
}
