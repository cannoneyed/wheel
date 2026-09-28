/**
 * The command palette: the one deliberately DATA-flavored global system.
 *
 * Commands genuinely are data — registered by services (constructor +
 * `addCleanup`, the contribution pattern that was wrong for menus and is
 * right here), searchable, invokable headlessly by id. The service owns the
 * command table, the ranking, and open/close state; `<CommandPaletteSystem/>`
 * (mounted once) registers its open keys (the `commandPalette.openKeyCommand`
 * config, default mod+k and mod+shift+p) through KeyboardService and renders
 * a centered overlay — input, ranked results, arrow-key selection, Enter runs,
 * Escape closes.
 *
 * The command table itself lives in `CommandService` (see `commands.ts`):
 * the palette is a viewer over it. A row shows the command's shortcut, its
 * check mark, and — for a disabled command — the reason it cannot run.
 * `registerCommand` stays as a small adapter for palette-only commands: it
 * registers a `CommandService` command whose `visible` is the old `when`.
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
import { WheelConfigService } from '../core/app-config';
import { z } from 'zod';
import { FocusService } from './focus';
import { KeyboardService, type KeyBinding } from './keyboard';
import { parseCombo } from './key-combo';
import { CommandService, type CommandState } from './commands';

/**
 * A palette-only command for `registerCommand` — pure data plus its action.
 * New code registers a full `CommandSpec` with `CommandService.register`,
 * which adds keys, an `enabled` rule with a reason, checks, and arguments.
 */
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
export interface CommandGroup<T extends { readonly group?: string } = CommandState> {
  /** The heading, or null for the ungrouped commands that lead the list. */
  readonly group: string | null;
  readonly commands: readonly T[];
}

/**
 * Cut ranked results into groups, keeping rank order. A group takes the
 * position of its best-ranked member, so typing never reorders the list out
 * from under the selection.
 */
export function groupCommands<T extends { readonly group?: string }>(
  commands: readonly T[]
): readonly CommandGroup<T>[] {
  const order: Array<string | null> = [];
  const byGroup = new Map<string | null, T[]>();
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

/**
 * The palette's open state, plus a thin view over `CommandService`: the
 * command list, search, and run-by-id all read the one registry. Everything
 * is headless — the host component is just a viewer over this data.
 */
export class CommandPaletteService extends Service {
  /** Identity that survives minification (see require-service-name). */
  static override serviceName = 'CommandPaletteService';

  /** State-tree group: wheel-internal plumbing, collapsed by default. */
  static override group = 'framework';

  private readonly commandService = this.service(CommandService);
  private readonly configService = this.service(WheelConfigService);
  /** Whether the palette overlay is open. */
  readonly isOpen = this.atom(false, 'isOpen');
  /** The combos that open it: the `commandPalette.openKeyCommand` config. */
  readonly openKeys = this.computed(
    () => this.configService.section('commandPalette', commandPaletteConfigSchema).openKeyCommand,
    'openKeys'
  );
  /**
   * The last command `run` invoked, or null before the first run. The
   * palette opens with this row selected — the command you reach for is
   * usually the one you just used.
   */
  readonly lastRunId = this.atom<string | null>(null, 'lastRunId');

  /**
   * Register a palette-only command; returns the unregister function. It
   * becomes a `CommandService` command whose `visible` is `when`, so ids
   * share one table: a duplicate throws and names both sites.
   */
  registerCommand(command: Command): () => void {
    const when = command.when;
    return this.commandService.register({
      id: command.id,
      title: command.title,
      keywords: command.keywords,
      group: command.group,
      subtitle: command.subtitle,
      icon: command.icon,
      visible: when ? () => when() : undefined,
      run: () => command.run()
    });
  }

  /** The palette's commands (visible, not `palette: false`), registration order. */
  readonly commands = this.computed(() => this.commandService.search(''), 'commands');

  /**
   * Case-insensitive search over the palette's commands, ranked: title
   * prefix > title substring > keyword, enabled before disabled. Empty
   * query returns everything. Stable (registration order) within a rank.
   */
  readonly search = this.computedFor((query: string) => this.commandService.search(query), 'search');

  /** Open the palette. */
  readonly open = this.action(() => this.isOpen.set(true), 'open');

  /** Close the palette. */
  readonly close = this.action(() => this.isOpen.set(false), 'close');

  /**
   * Run a command by id through `CommandService.execute` with
   * `source: 'palette'` — closing the palette first, so a command that
   * moves focus lands in the right place. Unknown and hidden ids are a
   * no-op. A disabled command does not run and the palette stays open: its
   * row already shows why.
   */
  readonly run = this.action((id: string) => {
    const state = this.commandService.stateOf(id, { source: 'palette' });
    if (!state || state.disabledReason !== undefined) return;
    this.isOpen.set(false);
    this.lastRunId.set(id);
    void this.commandService.execute(id, undefined, { source: 'palette' });
  }, 'run');
}

/** CommandPaletteSystem's connection — exported for stubs and the states file. */
export const connectCommandPaletteSystem = connect('CommandPaletteSystem', (c) => {
  const paletteService = c.service(CommandPaletteService);
  const keyboardService = c.service(KeyboardService);
  const focusService = c.service(FocusService);
  return view(
    {
      isOpen: paletteService.isOpen,
      lastRunId: paletteService.lastRunId,
      openKeys: paletteService.openKeys
    },
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

/**
 * The combos that open and close the palette when the app config sets none.
 * BOTH, because both are muscle memory: mod+k from Linear and Slack,
 * mod+shift+p from VS Code. A palette that answers one of them reads as
 * missing to whoever learned the other.
 */
export const DEFAULT_PALETTE_OPEN_KEYS: readonly string[] = ['mod+k', 'mod+shift+p'];

/** A combo `parseCombo` accepts. */
const combo = z.string().refine(
  (value) => {
    try {
      parseCombo(value, false);
      return true;
    } catch {
      return false;
    }
  },
  { message: 'not a key combo like "mod+shift+p"' }
);

/**
 * The `commandPalette` section of the Wheel app config.
 *
 *   export default defineWheelConfig({
 *     // mod+k inserts a link in this app, so only mod+shift+p opens the palette.
 *     commandPalette: { openKeyCommand: 'mod+shift+p' }
 *   });
 */
export const commandPaletteConfigSchema = z.strictObject({
  /**
   * The combo, or combos, that open and close the palette. Default
   * `['mod+k', 'mod+shift+p']`. An empty list registers no keys; open the
   * palette with `CommandPaletteService.open()` from your own UI.
   */
  openKeyCommand: z
    .union([combo, z.array(combo)])
    .default([...DEFAULT_PALETTE_OPEN_KEYS])
    .transform((value): readonly string[] => (typeof value === 'string' ? [value] : value))
});

declare module '../core/index' {
  interface WheelAppConfig {
    /** The command palette. */
    readonly commandPalette?: z.input<typeof commandPaletteConfigSchema>;
  }
}

/** The keyboard binding id for the open key at `index`. */
const openKeyBindingId = (index: number) =>
  index === 0 ? 'wheel.commandPalette.toggle' : `wheel.commandPalette.toggle.${index}`;

const COMMAND_LISTBOX_ID = 'wheel-command-palette-listbox';
const commandOptionId = (id: string) => `wheel-command-option-${encodeURIComponent(id)}`;

/**
 * Mount once at the app root. Registers the open keys (the
 * `commandPalette.openKeyCommand` config, default mod+k and mod+shift+p) with
 * KeyboardService while mounted and renders the palette overlay: scrim,
 * query input, ranked results, arrow-key selection, Enter runs, Escape
 * closes. Focus is captured on open and restored on close via FocusService.
 * It takes no props: app-wide settings live in `src/wheel.config.ts`.
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

  // subscription boundary: the open keys register with KeyboardService while
  // mounted. They come from the app config, read once. Each key toggles,
  // so any one of them both opens and closes the palette. Registration is
  // untracked: it reads the binding table, and tracking that would re-run
  // this effect on its own write.
  createEffect(() => {
    const keys = state.openKeys;
    keys.forEach((key, index) => {
      onCleanup(
        untrack(() => state.registerBinding({
          id: openKeyBindingId(index),
          key,
          description: 'Command palette',
          inInputs: true,
          inOverlays: true,
          run: () => (state.isOpen ? state.close() : state.open())
        }))
      );
    });
  });

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
                            aria-disabled={command.disabledReason !== undefined ? 'true' : undefined}
                            aria-checked={command.checked === undefined ? undefined : command.checked === 'mixed' ? 'mixed' : command.checked}
                            aria-keyshortcuts={command.keys?.[0]}
                            data-disabled={command.disabledReason !== undefined ? '' : undefined}
                            style={{
                              display: 'flex',
                              'align-items': 'center',
                              gap: '10px',
                              padding: '8px 16px',
                              // A disabled row keeps the arrow cursor: it
                              // says "this does nothing" before the click.
                              cursor: command.disabledReason !== undefined ? 'default' : 'pointer',
                              color:
                                command.disabledReason !== undefined
                                  ? 'var(--wheel-ink-muted, rgba(15,18,24,0.5))'
                                  : 'inherit',
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
                              {/* Why it cannot run. A dim row that cannot say
                                  why teaches nothing. */}
                              <Show when={command.disabledReason}>
                                {(reason) => (
                                  <span
                                    data-testid={`wheel-palette-reason-${command.id}`}
                                    style={{
                                      display: 'block',
                                      'font-size': '12px',
                                      color: 'var(--wheel-ink-muted, rgba(15,18,24,0.5))'
                                    }}
                                  >
                                    {reason()}
                                  </span>
                                )}
                              </Show>
                            </span>
                            <Show when={command.checked === true || command.checked === 'mixed'}>
                              <span
                                aria-hidden="true"
                                data-testid={`wheel-palette-check-${command.id}`}
                                style={{ color: 'var(--wheel-accent, #3b82f6)', flex: '0 0 auto' }}
                              >
                                {command.checked === 'mixed' ? '–' : '✓'}
                              </span>
                            </Show>
                            <Show when={command.shortcut}>
                              {(shortcut) => (
                                <kbd
                                  data-testid={`wheel-palette-shortcut-${command.id}`}
                                  style={{
                                    flex: '0 0 auto',
                                    'font-family': 'inherit',
                                    'font-size': '12px',
                                    color: 'var(--wheel-ink-muted, rgba(15,18,24,0.5))'
                                  }}
                                >
                                  {shortcut()}
                                </kbd>
                              )}
                            </Show>
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
