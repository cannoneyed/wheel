/**
 * The menu panel — the one look every stacked menu wears.
 *
 * It draws a `MenuStack` and nothing else: a back header when the stack is
 * deeper than its root, an optional size grid, and the entries. It owns no
 * state, no focus, and no placement. The caller positions it, and the
 * caller decides what a chosen entry closes.
 *
 * That split is what lets a `/` menu inside a text editor and a right-click
 * context menu share one component. The editor must NOT take DOM focus —
 * the caret has to stay in the text so typing keeps narrowing the query —
 * while a context menu must take it. Focus is therefore the caller's job.
 */
import { For, type JSX } from 'solid-js';

import { Show } from '../core/visibility';
import { viewRoot } from '../core/connect';
import type { MenuItem, MenuStack } from './menu-stack';

// Solid compiles `use:` directives away unless the name is referenced.
void viewRoot;

/** What the panel needs to draw one stack. */
export interface MenuStackPanelProps {
  /** The stack to draw. */
  readonly stack: MenuStack;
  /**
   * Read the state. The stack itself is not reactive, so the caller wraps
   * it in whatever signal it already keeps and passes the getter here.
   */
  readonly state: () => ReturnType<MenuStack['state']>;
  /** Called when an entry RAN — the caller closes the menu. */
  readonly onRun?: () => void;
  /** What to show when nothing matches the query. */
  readonly emptyLabel?: string;
}

/** One square's shade in the size grid. */
function squareFill(active: boolean): string {
  return active ? 'var(--wheel-accent, #3b82f6)' : 'var(--wheel-bg-raised, #fff)';
}

/**
 * The size grid: a sweep of squares that names a size. Hovering the square
 * at row 3, column 5 lights every square above and left of it, so the lit
 * block IS the table you are about to insert.
 */
function SizeGrid(props: MenuStackPanelProps): JSX.Element {
  const grid = () => props.state().grid;
  const point = () => props.state().gridPoint;
  return (
    <Show when={grid()} keyed>
      {(size) => (
        <div
          use:viewRoot={{ name: 'SizeGrid', group: 'framework', props }}
          data-testid="wheel-menu-grid"
          style={{ padding: '8px 10px 6px' }}
        >
          <div
            style={{
              display: 'grid',
              'grid-template-columns': `repeat(${size.columns}, 14px)`,
              gap: '2px'
            }}
            onPointerLeave={() => props.stack.highlightGrid({ rows: 0, columns: 0 })}
          >
            <For each={Array.from({ length: size.rows * size.columns })}>
              {(_, cell) => {
                const row = () => Math.floor(cell() / size.columns) + 1;
                const column = () => (cell() % size.columns) + 1;
                const active = () => row() <= point().rows && column() <= point().columns;
                return (
                  <button
                    type="button"
                    aria-label={`${row()} by ${column()}`}
                    data-testid={`wheel-menu-square-${row()}-${column()}`}
                    style={{
                      width: '14px',
                      height: '14px',
                      padding: '0',
                      cursor: 'pointer',
                      border: '1px solid var(--wheel-line, #d8dee9)',
                      'border-radius': '2px',
                      background: squareFill(active())
                    }}
                    onPointerEnter={() =>
                      props.stack.highlightGrid({ rows: row(), columns: column() })
                    }
                    onMouseDown={(event) => {
                      // The caret must not move: an editor's menu dies the
                      // moment its host loses the selection.
                      event.preventDefault();
                      props.stack.highlightGrid({ rows: row(), columns: column() });
                      if (props.stack.chooseGrid()) {
                        props.onRun?.();
                      }
                    }}
                  />
                );
              }}
            </For>
          </div>
          <div
            data-testid="wheel-menu-grid-size"
            style={{
              'padding-top': '5px',
              'font-size': '11px',
              color: 'var(--wheel-ink-muted, #6b7280)'
            }}
          >
            {point().rows > 0
              ? `${point().rows} × ${point().columns}`
              : `up to ${size.rows} × ${size.columns}`}
          </div>
        </div>
      )}
    </Show>
  );
}

/** The stacked menu panel (see module doc). */
export function MenuStackPanel(props: MenuStackPanelProps): JSX.Element {
  const choose = (item: MenuItem) => {
    if (props.stack.choose(item) === 'ran') {
      props.onRun?.();
    }
  };
  return (
    <div
      use:viewRoot={{ name: 'MenuStackPanel', group: 'framework', props }}
      data-testid="wheel-menu-stack"
      style={{
        display: 'flex',
        'flex-direction': 'column',
        'min-width': '190px',
        padding: '4px',
        background: 'var(--wheel-bg-raised, #fff)',
        color: 'var(--wheel-ink, inherit)',
        border: '1px solid var(--wheel-line, #d8dee9)',
        'border-radius': '8px',
        'box-shadow': 'var(--wheel-shadow-overlay, 0 8px 24px rgba(0,0,0,0.14))'
      }}
    >
      {/* The back control sits LEFT of the title, on one row: the header
          says where you are and how to leave in the same glance. */}
      <Show when={props.state().title} keyed>
        {(title) => (
          <div
            style={{
              display: 'flex',
              'align-items': 'center',
              gap: '4px',
              padding: '2px 4px 5px',
              'border-bottom': '1px solid var(--wheel-line, #d8dee9)',
              'margin-bottom': '4px'
            }}
          >
            <button
              type="button"
              aria-label="Back"
              data-testid="wheel-menu-back"
              style={{
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                padding: '2px 4px',
                'border-radius': '4px',
                color: 'var(--wheel-ink-muted, #6b7280)',
                'line-height': '1'
              }}
              onMouseDown={(event) => {
                event.preventDefault();
                props.stack.pop();
              }}
            >
              ‹
            </button>
            <span style={{ 'font-size': '12px', 'font-weight': '600' }}>{title}</span>
          </div>
        )}
      </Show>
      <SizeGrid {...props} />
      {/* The field owns the keys while it holds the focus, so the items
          below stay clickable but stop answering the arrows. */}
      <Show when={props.state().input} keyed>
        {(input) => (
          <input
            data-testid="wheel-menu-input"
            placeholder={input.placeholder}
            value={input.initial()}
            style={{
              margin: '2px 4px 6px',
              padding: '5px 7px',
              border: '1px solid var(--wheel-line, #d8dee9)',
              'border-radius': '5px',
              background: 'var(--wheel-bg, #fff)',
              color: 'inherit',
              font: 'inherit',
              'font-size': '13px'
            }}
            ref={(element) => queueMicrotask(() => element.focus())}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                input.submit(event.currentTarget.value);
                props.onRun?.();
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                props.stack.pop();
              }
            }}
          />
        )}
      </Show>
      <For each={props.state().items}>
        {(item, index) => (
          <button
            type="button"
            role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
            aria-checked={item.checked}
            data-testid={`wheel-menu-item-${item.id}`}
            data-active={index() === props.state().index ? '' : undefined}
            data-disabled={item.disabled === true ? '' : undefined}
            aria-disabled={item.disabled === true ? 'true' : undefined}
            style={{
              display: 'flex',
              'align-items': 'center',
              'justify-content': 'space-between',
              gap: '8px',
              width: '100%',
              padding: '5px 8px',
              border: 'none',
              'border-radius': '5px',
              // A disabled entry keeps the arrow cursor: the pointer says it
              // does nothing before the click proves it.
              cursor: item.disabled === true ? 'default' : 'pointer',
              'text-align': 'left',
              'font-size': '13px',
              color: item.disabled === true ? 'var(--wheel-ink-muted, #6b7280)' : 'inherit',
              background:
                index() === props.state().index
                  ? 'var(--wheel-bg-selected, rgba(59,130,246,0.14))'
                  : 'none'
            }}
            onPointerEnter={() => props.stack.highlight(index())}
            onMouseDown={(event) => {
              event.preventDefault();
              choose(item);
            }}
          >
            <span>{item.label}</span>
            {/* Why it cannot run. Without this the dim entry only says "no". */}
            <Show when={item.disabled === true && item.disabledReason}>
              <span style={{ color: 'var(--wheel-ink-muted, #6b7280)', 'font-size': '12px' }}>
                {item.disabledReason}
              </span>
            </Show>
            {/* A group says it goes deeper; a toggle says whether it is on. */}
            <Show when={item.submenu}>
              <span style={{ color: 'var(--wheel-ink-muted, #6b7280)' }}>›</span>
            </Show>
            {/* Read the check through `state()`, not off `item`: a toggle's
                `checked` may be a getter over live state, and only the
                signal the caller drives tells this row to draw again. */}
            <Show when={props.state().items[index()]?.checked === true}>
              <span style={{ color: 'var(--wheel-accent, #3b82f6)' }}>✓</span>
            </Show>
          </button>
        )}
      </For>
      <Show
        when={props.state().items.length === 0 && !props.state().grid && !props.state().input}
      >
        <span
          data-testid="wheel-menu-empty"
          style={{
            padding: '5px 8px',
            'font-size': '13px',
            color: 'var(--wheel-ink-muted, #6b7280)'
          }}
        >
          {props.emptyLabel ?? 'no match'}
        </span>
      </Show>
    </div>
  );
}
