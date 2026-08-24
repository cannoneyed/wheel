/**
 * The property-picker overlay: one keyboard-first surface for every property
 * and filter menu. Mounted once by the shell; renders only while a picker is
 * open. Arrow/enter/escape are handled on the input itself (the overlay owns
 * an editable target, so document-level shortcuts stay muted by design).
 */
import { For, createEffect, onCleanup } from 'solid-js';
import { Portal } from 'solid-js/web';
import { Show, componentRoot, connect, view } from 'wheel/core';

import { PickerService } from '../../services/picker-service';
import styles from './picker-overlay.module.css';

const connectPickerOverlay = connect('PickerOverlay', (c) => {
  const pickerService = c.service(PickerService);
  return view(
    {
      isOpen: pickerService.isOpen,
      title: pickerService.title,
      query: pickerService.query,
      options: pickerService.filtered,
      activeIndex: pickerService.activeIndex,
      isMulti: pickerService.isMulti
    },
    {
      close: pickerService.close,
      setQuery: pickerService.setQuery,
      moveActive: pickerService.moveActive,
      pick: pickerService.pick,
      pickActive: pickerService.pickActive,
      isApplied: pickerService.isApplied
    }
  );
});

/** The one picker host. Mount once inside the provider. */
export function PickerOverlay() {
  const state = connectPickerOverlay({});

  // listener boundary: while a picker is open, Escape closes it no matter
  // where focus sits (a mouse pick in a multi-select moves focus OFF the
  // input, whose own Escape handler then never hears the key).
  createEffect(() => {
    if (!state.isOpen) return;
    const onDocKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        state.close();
      }
    };
    document.addEventListener('keydown', onDocKey, { capture: true });
    onCleanup(() => document.removeEventListener('keydown', onDocKey, { capture: true }));
  });

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      state.moveActive(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      state.moveActive(-1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      state.pickActive();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      state.close();
    }
  };
  return (
    <Show when={state.isOpen}>
      <Portal>
        <div
          use:componentRoot
          class={styles.scrim}
          onClick={(event) => {
            if (event.target === event.currentTarget) state.close();
          }}
        >
          <div class={styles.panel} role="listbox" aria-label={state.title ?? 'Picker'}>
            <div class={styles.title}>{state.title}</div>
            <input
              class={styles.input}
              placeholder="Type to filter…"
              value={state.query}
              onInput={(event) => state.setQuery(event.currentTarget.value)}
              onKeyDown={onKeyDown}
              ref={(element) => {
                // dom boundary: the overlay just mounted from an action; focus
                // must land in the type-ahead input on the next tick.
                queueMicrotask(() => element.focus());
              }}
            />
            <div class={styles.options}>
              <For each={state.options}>
                {(option, index) => (
                  <button
                    class={styles.option}
                    classList={{ [styles.optionActive]: index() === state.activeIndex }}
                    onClick={() => state.pick(option.id)}
                  >
                    <Show when={option.icon}>
                      <span class={styles.icon} style={option.color ? { color: option.color } : undefined}>
                        {option.icon}
                      </span>
                    </Show>
                    <span class={styles.label}>{option.label}</span>
                    <Show when={option.hint}>
                      <span class={styles.hint}>{option.hint}</span>
                    </Show>
                    <Show when={state.isApplied(option.id)}>
                      <span class={styles.check}>✓</span>
                    </Show>
                  </button>
                )}
              </For>
              <Show when={state.options.length === 0}>
                <div class={styles.empty}>No matches</div>
              </Show>
            </div>
            <Show when={state.isMulti}>
              <div class={styles.footer}>enter toggles · esc closes</div>
            </Show>
          </div>
        </div>
      </Portal>
    </Show>
  );
}
