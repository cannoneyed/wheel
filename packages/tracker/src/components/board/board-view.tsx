/**
 * The board view: one column per workflow state, cards in
 * boardOrder, drag to move/reorder. The drag itself is the pure machine in
 * machines/drag-machine.ts — this component is only its edge: pointer
 * listeners in, hit-testing (DOM rects → DropTarget), ghost + drop line out.
 */
import { For, Show, onCleanup } from 'solid-js';
import { componentRoot, connect, useSignal, view } from 'wheel/core';

import { ViewOptionsService } from '../../services/view-options-service';
import { IssueInteractionService } from '../../services/issue-interaction-service';
import { DRAG_IDLE, dragTransition, type DragState, type DropTarget } from '../../machines/drag-machine';
import { BoardCard } from './board-card';
import styles from './board-view.module.css';

const connectBoardView = connect(
  (props: { teamId: string }) => `BoardView:${props.teamId}`,
  (c, props: { teamId: string }) => {
    const viewOptions = c.service(ViewOptionsService);
    const interactionService = c.service(IssueInteractionService);
    return view(
      { columns: () => viewOptions.boardColumns(props.teamId) },
      { drop: interactionService.dropOnBoard }
    );
  }
);

/** Hit-test a pointer position into a DropTarget (column + card index). */
function findDropTarget(x: number, y: number, draggedId: string): DropTarget | null {
  const element = document.elementFromPoint(x, y);
  const column = element?.closest<HTMLElement>('[data-board-column]');
  if (!column) return null;
  const stateId = column.dataset.boardColumn!;
  const cards = [...column.querySelectorAll<HTMLElement>('[data-board-card]')].filter(
    (card) => card.dataset.boardCard !== draggedId
  );
  let index = cards.length;
  for (const [cardIndex, card] of cards.entries()) {
    const rect = card.getBoundingClientRect();
    if (y < rect.top + rect.height / 2) {
      index = cardIndex;
      break;
    }
  }
  return { stateId, index };
}

/** The board for one team. */
export function BoardView(props: { teamId: string }) {
  const state = connectBoardView(props);
  const [drag, setDrag] = useSignal<DragState>(DRAG_IDLE, 'drag');

  let removeListeners: (() => void) | null = null;
  const detach = () => {
    removeListeners?.();
    removeListeners = null;
  };
  onCleanup(detach);

  const onPress = (issueId: string, event: PointerEvent) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest('button')) return;
    setDrag(dragTransition(drag(), { kind: 'press', issueId, x: event.clientX, y: event.clientY }).state);
    const onMove = (moveEvent: PointerEvent) => {
      const result = dragTransition(drag(), {
        kind: 'move',
        x: moveEvent.clientX,
        y: moveEvent.clientY,
        target: findDropTarget(moveEvent.clientX, moveEvent.clientY, issueId)
      });
      setDrag(result.state);
    };
    const onUp = () => {
      const wasDragging = drag().kind === 'dragging';
      const result = dragTransition(drag(), { kind: 'release' });
      setDrag(result.state);
      detach();
      if (result.drop) {
        state.drop(result.drop.issueId, result.drop.target.stateId, result.drop.target.index);
      }
      if (wasDragging) {
        // A real drag must not read as a click on the card underneath.
        const swallow = (clickEvent: MouseEvent) => {
          clickEvent.stopPropagation();
          clickEvent.preventDefault();
        };
        document.addEventListener('click', swallow, { capture: true, once: true });
      }
    };
    const onKey = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === 'Escape') {
        setDrag(dragTransition(drag(), { kind: 'cancel' }).state);
        detach();
      }
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('keydown', onKey);
    removeListeners = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('keydown', onKey);
    };
  };

  const dragging = () => {
    const current = drag();
    return current.kind === 'dragging' ? current : null;
  };
  const draggedVm = () => {
    const current = dragging();
    if (!current) return null;
    for (const column of state.columns) {
      const vm = column.cards.find((card) => card.issue.id === current.issueId);
      if (vm) return vm;
    }
    return null;
  };
  const dropIndexFor = (stateId: string): number | null => {
    const current = dragging();
    return current?.over?.stateId === stateId ? current.over.index : null;
  };

  return (
    <div use:componentRoot class={styles.board}>
      <For each={state.columns}>
        {(column) => (
          <section class={styles.column} data-board-column={column.state.id}>
            <header class={styles.columnHeader}>
              <span style={{ color: column.state.color }}>●</span>
              <span class={styles.columnName}>{column.state.name}</span>
              <span class={styles.columnCount}>{column.cards.length}</span>
            </header>
            <div class={styles.cards}>
              <For each={column.cards}>
                {(vm, index) => (
                  <>
                    <Show when={dropIndexFor(column.state.id) === index()}>
                      <div class={styles.dropLine} />
                    </Show>
                    <BoardCard
                      teamId={props.teamId}
                      vm={vm}
                      ghosted={dragging()?.issueId === vm.issue.id}
                      onPress={onPress}
                    />
                  </>
                )}
              </For>
              <Show when={dropIndexFor(column.state.id) === column.cards.length}>
                <div class={styles.dropLine} />
              </Show>
            </div>
          </section>
        )}
      </For>
      <Show when={draggedVm()}>
        {(vm) => (
          <div class={styles.ghost} style={{ left: `${dragging()!.x + 8}px`, top: `${dragging()!.y + 8}px` }}>
            <span class={styles.ghostId}>
              {vm().teamKey}-{vm().issue.number === 0 ? '…' : vm().issue.number}
            </span>
            {vm().issue.title}
          </div>
        )}
      </Show>
    </div>
  );
}
