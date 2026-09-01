/**
 * The command palette: the one deliberately DATA-flavored global system.
 *
 * Commands genuinely are data — registered by services (constructor +
 * `addCleanup`, the contribution pattern that was wrong for menus and is
 * right here), searchable, invokable headlessly by id. The service owns the
 * command table, the ranking, and open/close state; `<CommandPaletteSystem/>`
 * (mounted once) registers mod+k through KeyboardService and renders a
 * centered overlay — input, ranked results, arrow-key selection, Enter runs,
 * Escape closes.
 *
 * A command DESCRIBES itself — `group`, `subtitle`, `icon` — and the palette
 * decides how that reads. It does not RENDER itself: there is no per-command
 * component, because a palette whose rows each draw their own thing stops
 * being one list. Anything richer than a described row belongs in the UI the
 * command opens.
 */
import { For, createEffect, createMemo, onCleanup, untrack, type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';

import { Show } from '../core/visibility';
import { Service } from '../core/services';
import { componentRoot, connect } from '../core/connect';
import { view } from '../core/view';
import { useSignal } from '../core/local-state';
import { captureDeclSite } from '../core/decl-site';
import { FocusService } from './focus';
import { KeyboardService, type KeyBinding } from './keyboard';

/** A registered command — pure data plus its action. */
export interface Command {
  /** Stable unique id (e.g. `'board.addColumn'`) — the invocation handle. */
  readonly id: string;
  /** What the palette shows; also the primary search field. */
  readonly title: string;
  /** Executes the command. The palette closes before running. */
  readonly run: () => void;
  /** Extra search terms (matched after title prefix/substring). */
  readonly keywords?: readonly string[];
  /** Reactive visibility gate — hidden (and un-runnable) while false. */
  readonly when?: () => boolean;
  /**
   * The heading this command sits under (e.g. `'Go to'`, `'Session'`).
   * Ungrouped commands come first, under no heading. Group ORDER follows the
   * ranked results, so the best match always leads the list.
   */
  readonly group?: string;
  /** One line under the title — what it does, or where it goes. */
  readonly subtitle?: string;
  /** A leading glyph. The palette sizes the slot; the command fills it. */
  readonly icon?: () => JSX.Element;
}

/** Ranked results cut into their headings — what the palette renders. */
export interface CommandGroup {
  /** The heading, or null for the ungrouped commands that lead the list. */
  readonly group: string | null;
  readonly commands: readonly Command[];
}

/**
 * Cut ranked results into groups, keeping rank order. A group takes the
 * position of its best-ranked member, so typing never reorders the list out
 * from under the selection.
 */
export function groupCommands(commands: readonly Command[]): readonly CommandGroup[] {
  const order: Array<string | null> = [];
  const byGroup = new Map<string | null, Command[]>();
  for (const command of commands) {
    const key = command.group ?? null;
    const bucket = byGroup.get(key);
    if (bucket) {
      bucket.push(command);
    } else {
      order.push(key);
      byGroup.set(key, [command]);
    }
  }
  return order.map((group) => ({ group, commands: byGroup.get(group) ?? [] }));
}

interface RegisteredCommand {
  readonly command: Command;
  readonly declaredAt: string;
}

/**
 * Owns the command table, search ranking, and the palette's open state.
 * Everything is headless: `commands()`/`search()` are computeds, `run(id)`
 * invokes by id — the host component is just a viewer over this data.
 */
export class CommandPaletteService extends Service {
  /** Identity that survives minification (see require-service-name). */
  static override serviceName = 'CommandPaletteService';

  /** State-tree group: wheel-internal plumbing, collapsed by default. */
  static override group = 'framework';

  private readonly registered = this.atom<readonly RegisteredCommand[]>([], 'registered');
  /** Whether the palette overlay is open. */
  readonly isOpen = this.atom(false, 'isOpen');
  /**
   * The last command `run` invoked, or null before the first run. The
   * palette opens with this row selected — the command you reach for is
   * usually the one you just used.
   */
  readonly lastRunId = this.atom<string | null>(null, 'lastRunId');

  /**
   * Register a command; returns the unregister function. Services register
   * in their constructors and pair with `addCleanup`; components use
   * `onCleanup`. Command ids are unique within one service context.
   */
  registerCommand(command: Command): () => void {
    const declaredAt = captureDeclSite(/\/kit\/command-palette\.(?:tsx?|jsx?)/);
    const existing = this.registered.get().find((entry) => entry.command.id === command.id);
    if (existing) {
      throw new Error(
        `Duplicate command id '${command.id}'. First registered at ${existing.declaredAt}; duplicate registered at ${declaredAt}.`
      );
    }
    const entry: RegisteredCommand = { command, declaredAt };
    this.registered.set([...this.registered.get(), entry]);
    return () => {
      this.registered.set(this.registered.get().filter((existing) => existing !== entry));
    };
  }

  /** Visible commands (their `when()` gates pass), registration order. */
  readonly commands = this.computed(
    () =>
      this.registered
        .get()
        .map((entry) => entry.command)
        .filter((command) => command.when?.() ?? true),
    'commands'
  );

  /**
   * Case-insensitive search over visible commands, ranked: title prefix >
   * title substring > keyword substring. Empty query returns everything
   * visible. Stable (registration order) within a rank.
   */
  readonly search = this.computedFor((query: string) => {
    const visible = this.commands();
    const needle = query.trim().toLowerCase();
    if (!needle) return visible;
    const ranked: Array<{ command: Command; rank: number }> = [];
    for (const command of visible) {
      const title = command.title.toLowerCase();
      const rank = title.startsWith(needle)
        ? 0
        : title.includes(needle)
          ? 1
          : (command.keywords ?? []).some((keyword) => keyword.toLowerCase().includes(needle))
            ? 2
            : -1;
      if (rank >= 0) ranked.push({ command, rank });
    }
    return ranked.sort((a, b) => a.rank - b.rank).map((entry) => entry.command);
  }, 'search');

  /** Open the palette. */
  readonly open = this.action(() => this.isOpen.set(true), 'open');

  /** Close the palette. */
  readonly close = this.action(() => this.isOpen.set(false), 'close');

  /**
   * Invoke a command by id — closes the palette first, then runs. No-op for
   * unknown ids and commands whose `when()` currently fails (a hidden
   * command must not be runnable through a stale reference).
   */
  readonly run = this.action((id: string) => {
    const command = this.commands().find((candidate) => candidate.id === id);
    if (!command) return;
    this.isOpen.set(false);
    this.lastRunId.set(id);
    command.run();
  }, 'run');
}

/** CommandPaletteSystem's connection — exported for stubs and the states file. */
export const connectCommandPaletteSystem = connect('CommandPaletteSystem', (c) => {
  const paletteService = c.service(CommandPaletteService);
  const keyboardService = c.service(KeyboardService);
  const focusService = c.service(FocusService);
  return view(
    { isOpen: paletteService.isOpen, lastRunId: paletteService.lastRunId },
    {
      resultsFor: (query: string) => paletteService.search(query),
      open: paletteService.open,
      close: paletteService.close,
      run: paletteService.run,
      registerBinding: (binding: KeyBinding) => keyboardService.register(binding),
      enterOverlay: focusService.enterOverlay,
      trapOverlayTab: focusService.trapOverlayTab
    }
  );
}, { group: 'framework' });

/** The combos that open and close the palette, as `[binding id, combo]`. */
const TOGGLE_COMBOS: readonly (readonly [string, string])[] = [
  ['wheel.commandPalette.toggle', 'mod+k'],
  ['wheel.commandPalette.toggleAlt', 'mod+shift+p']
];

const COMMAND_LISTBOX_ID = 'wheel-command-palette-listbox';
const commandOptionId = (id: string) => `wheel-command-option-${encodeURIComponent(id)}`;

/**
 * Mount once at the app root. Registers the toggle combos with
 * KeyboardService while mounted and renders the palette overlay: scrim,
 * query input, ranked results, arrow-key selection, Enter runs, Escape
 * closes. Focus is captured on open and restored on close via FocusService.
 */
export function CommandPaletteSystem(): JSX.Element {
  const state = connectCommandPaletteSystem({});
  const [query, setQuery] = useSignal('', 'query');
  const [selected, setSelected] = useSignal(0, 'selected');
  // SIGNALS, not plain refs: the focus effect must re-run when the portal
  // content actually lands. A plain ref that was unset when the effect
  // first ran left the palette open but unfocused — arrows kept going to
  // the editor under it.
  const [inputEl, setInputEl] = useSignal<HTMLInputElement | undefined>(undefined, 'inputEl');
  const [panelEl, setPanelEl] = useSignal<HTMLDivElement | undefined>(undefined, 'panelEl');

  // BOTH palette combos, because both are muscle memory: mod+k from Linear
  // and Slack, mod+shift+p from VS Code. A palette that answers one of them
  // reads as missing to whoever learned the other.
  for (const [id, key] of TOGGLE_COMBOS) {
    onCleanup(
      state.registerBinding({
        id,
        key,
        inInputs: true,
        inOverlays: true,
        run: () => (state.isOpen ? state.close() : state.open())
      })
    );
  }

  // Grouping decides the RENDER order, so the selection index must count
  // through the grouped list — not through the raw ranking behind it.
  const grouped = createMemo(() => groupCommands(state.resultsFor(query())));
  const results = createMemo(() => grouped().flatMap((entry) => entry.commands));
  const selectedIndex = () => Math.min(selected(), Math.max(results().length - 1, 0));
  /** Where a group's first command sits in the flat list. */
  const offsetOf = (groupIndex: number) =>
    grouped()
      .slice(0, groupIndex)
      .reduce((total, entry) => total + entry.commands.length, 0);

  // focus boundary: opening enters the shared overlay stack, resets search,
  // and focuses the combobox. Cleanup restores the previous focus owner.
  createEffect(() => {
    const panel = panelEl();
    const input = inputEl();
    if (!state.isOpen || !panel || !input) return;
    setQuery('');
    // Open on the command you last ran (when it still ranks), so repeating
    // an action is open + Enter. `untrack`: the list must not re-enter the
    // overlay when results churn while the palette sits open.
    untrack(() => {
      const index = state.lastRunId === null ? -1 : results().findIndex((command) => command.id === state.lastRunId);
      setSelected(Math.max(index, 0));
    });
    const leaveOverlay = state.enterOverlay(panel, input);
    onCleanup(leaveOverlay);
  });

  const onKeyDown = (event: KeyboardEvent) => {
    const list = results();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();
      setSelected(Math.min(selectedIndex() + 1, Math.max(list.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      setSelected(Math.max(selectedIndex() - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      const command = list[selectedIndex()];
      if (command) state.run(command.id);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      state.close();
    }
  };

  const activeOptionId = () => {
    const command = results()[selectedIndex()];
    return command ? commandOptionId(command.id) : undefined;
  };

  return (
    <Show when={state.isOpen}>
      <Portal>
        <div
          use:componentRoot
          data-testid="wheel-palette-overlay"
          style={{
            position: 'fixed',
            inset: '0',
            background: 'var(--wheel-scrim, rgba(15,18,24,0.4))',
            display: 'flex',
            'align-items': 'flex-start',
            'justify-content': 'center',
            'padding-top': '15vh',
            'z-index': 9_500
          }}
          onPointerDown={() => state.close()}
        >
          <div
            ref={setPanelEl}
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            data-testid="wheel-palette"
            style={{
              background: 'var(--wheel-bg-raised, white)',
              color: 'var(--wheel-ink, inherit)',
              'border-radius': '10px',
              'min-width': '420px',
              'max-width': '560px',
              'box-shadow': 'var(--wheel-shadow-stage, 0 16px 48px rgba(0,0,0,0.2))',
              overflow: 'hidden'
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (state.trapOverlayTab(event.currentTarget, event)) {
                event.stopPropagation();
              }
            }}
          >
            <input
              ref={setInputEl}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded="true"
              aria-controls={COMMAND_LISTBOX_ID}
              aria-activedescendant={activeOptionId()}
              data-testid="wheel-palette-input"
              placeholder="Type a command…"
              value={query()}
              onInput={(event) => {
                setQuery((event.target as HTMLInputElement).value);
                setSelected(0);
              }}
              onKeyDown={onKeyDown}
              style={{
                width: '100%',
                border: 'none',
                outline: 'none',
                padding: '14px 16px',
                'font-size': '15px',
                // The input inherited the UA's field colors, which stay light
                // even when the panel around them themes dark. Naming them
                // (with the UA-equivalent literals as fallbacks) keeps today's
                // look and lets the whole sheet theme as one surface.
                background: 'var(--wheel-bg-raised, white)',
                color: 'var(--wheel-ink, inherit)',
                'border-bottom': '1px solid var(--wheel-line, rgba(15,18,24,0.1))',
                'box-sizing': 'border-box'
              }}
            />
            <div
              id={COMMAND_LISTBOX_ID}
              role="listbox"
              aria-label="Commands"
              style={{ 'max-height': '40vh', 'overflow-y': 'auto', padding: '6px 0' }}
            >
              <For each={grouped()}>
                {(entry, groupIndex) => (
                  <div role="group" aria-label={entry.group ?? undefined}>
                    <Show when={entry.group}>
                      {(heading) => (
                        <div
                          data-testid={`wheel-palette-group-${heading()}`}
                          style={{
                            padding: '8px 16px 4px',
                            'font-size': '11px',
                            'font-weight': '600',
                            'letter-spacing': '0.04em',
                            'text-transform': 'uppercase',
                            color: 'var(--wheel-ink-muted, rgba(15,18,24,0.5))'
                          }}
                        >
                          {heading()}
                        </div>
                      )}
                    </Show>
                    <For each={entry.commands}>
                      {(command, index) => {
                        const flatIndex = () => offsetOf(groupIndex()) + index();
                        const isSelected = () => flatIndex() === selectedIndex();
                        return (
                          <div
                            id={commandOptionId(command.id)}
                            role="option"
                            tabIndex={-1}
                            data-testid={`wheel-palette-item-${command.id}`}
                            aria-selected={isSelected()}
                            style={{
                              display: 'flex',
                              'align-items': 'center',
                              gap: '10px',
                              padding: '8px 16px',
                              cursor: 'pointer',
                              background: isSelected() ? 'var(--wheel-bg-hover, rgba(15,18,24,0.08))' : 'transparent'
                            }}
                            onPointerEnter={() => setSelected(flatIndex())}
                            onClick={() => state.run(command.id)}
                          >
                            <Show when={command.icon}>
                              {(icon) => (
                                <span
                                  aria-hidden="true"
                                  style={{
                                    display: 'flex',
                                    'align-items': 'center',
                                    'justify-content': 'center',
                                    width: '16px',
                                    height: '16px',
                                    flex: '0 0 auto',
                                    color: 'var(--wheel-ink-muted, rgba(15,18,24,0.5))'
                                  }}
                                >
                                  {icon()()}
                                </span>
                              )}
                            </Show>
                            <span style={{ 'min-width': '0', flex: '1 1 auto' }}>
                              <span style={{ display: 'block' }}>{command.title}</span>
                              <Show when={command.subtitle}>
                                {(subtitle) => (
                                  <span
                                    style={{
                                      display: 'block',
                                      'font-size': '12px',
                                      color: 'var(--wheel-ink-muted, rgba(15,18,24,0.5))',
                                      overflow: 'hidden',
                                      'text-overflow': 'ellipsis',
                                      'white-space': 'nowrap'
                                    }}
                                  >
                                    {subtitle()}
                                  </span>
                                )}
                              </Show>
                            </span>
                          </div>
                        );
                      }}
                    </For>
                  </div>
                )}
              </For>
              <Show when={results().length === 0}>
                <div style={{ padding: '8px 16px', color: 'var(--wheel-ink-muted, rgba(15,18,24,0.5))' }}>
                  No matching commands
                </div>
              </Show>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
}
