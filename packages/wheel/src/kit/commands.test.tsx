// @vitest-environment jsdom
/**
 * CommandService's contract: one record per action, `visible` apart from
 * `enabled` (with a required reason), checks, arguments, the one
 * `execute` path with its results and hooks, keys linked to commands, and
 * the palette as a viewer over the registry.
 */
import { describe, expect, it } from 'vitest';
import { createSignal } from 'solid-js';
import { render } from 'solid-js/web';

import { ServiceContext, ServiceProvider, connect, defineWheelConfig } from '../core/index';
import {
  CommandPaletteSystem,
  CommandService,
  FocusService,
  KeyboardService,
  KeyboardSystem,
  ToastService,
  findConflicts,
  formatCombo,
  type CommandContext,
  type CommandSpec,
  type ExecuteEvent
} from './index';

function keydown(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent('keydown', { cancelable: true, bubbles: true, ...init });
}

/** The app's own context: what Wheel cannot know. */
interface DeskCtx extends CommandContext {
  readonly selected: number;
  readonly locked: boolean;
}

function setup() {
  const context = new ServiceContext({ scopeId: 'commands' });
  const commands = context.get(CommandService);
  const keyboard = context.get(KeyboardService);
  const toasts = context.get(ToastService);
  const focus = context.get(FocusService);
  const [selected, setSelected] = createSignal(0);
  const [locked, setLocked] = createSignal(false);
  commands.setContext((request) => ({
    // An agent's context comes from the agent, not from the person's screen.
    selected: request.actor === 'agent-7' ? 5 : selected(),
    locked: locked()
  }));
  return { context, commands, keyboard, toasts, focus, setSelected, setLocked };
}

const archive = (runs: string[]): CommandSpec<DeskCtx> => ({
  id: 'desk.archive',
  title: 'Archive',
  keys: ['mod+backspace'],
  visible: (ctx) => ctx.focus.scope !== 'settings',
  enabled: (ctx) => (ctx.selected > 0 ? true : { reason: 'Select an item first' }),
  run: (ctx) => void runs.push(`archive:${ctx.selected}:${ctx.source}`)
});

describe('CommandService (headless)', () => {
  it('rejects a duplicate id with both declaration sites, and unregisters cleanly', () => {
    const { context, commands, keyboard } = setup();
    try {
      const stop = commands.register({ id: 'a', title: 'First', keys: ['mod+j'], run: () => {} });
      expect(() => commands.register({ id: 'a', title: 'Again', run: () => {} })).toThrow(
        /Duplicate command id 'a'.*First registered at.*duplicate registered at/
      );
      expect(keyboard.registrations().map((binding) => binding.id)).toEqual(['command:a']);
      stop();
      expect(commands.all()).toEqual([]);
      expect(keyboard.registrations()).toEqual([]);
    } finally {
      context.dispose();
    }
  });

  it('execute returns unknown, hidden, disabled with a reason, and ok; run only on ok', async () => {
    const { context, commands, focus, setSelected } = setup();
    try {
      const runs: string[] = [];
      commands.register(archive(runs));

      expect(await commands.execute('missing')).toEqual({ ok: false, why: 'unknown' });
      expect(await commands.execute('desk.archive')).toEqual({
        ok: false,
        why: 'disabled',
        reason: 'Select an item first'
      });
      setSelected(2);
      expect(await commands.execute('desk.archive')).toEqual({ ok: true });
      expect(runs).toEqual(['archive:2:api']);

      const settings = document.createElement('div');
      document.body.appendChild(settings);
      focus.registerScope('settings', settings);
      focus.noteFocusChange(settings);
      expect(await commands.execute('desk.archive')).toEqual({ ok: false, why: 'hidden' });
      expect(runs).toEqual(['archive:2:api']);
      settings.remove();
    } finally {
      context.dispose();
    }
  });

  it('runs a synchronous command before execute returns', () => {
    const { context, commands } = setup();
    try {
      const runs: string[] = [];
      commands.register({ id: 'now', title: 'Now', run: () => void runs.push('ran') });
      void commands.execute('now');
      expect(runs).toEqual(['ran']);
    } finally {
      context.dispose();
    }
  });

  it('onExecute sees each source, the actor, and the result; nothing else differs', async () => {
    const { context, commands, setSelected } = setup();
    try {
      const runs: string[] = [];
      const events: ExecuteEvent[] = [];
      commands.register(archive(runs));
      commands.onExecute((event) => events.push(event));
      setSelected(1);
      for (const source of ['key', 'palette', 'menu', 'toolbar'] as const) {
        await commands.execute('desk.archive', undefined, { source });
      }
      await commands.execute('desk.archive', undefined, { source: 'agent', actor: 'agent-7' });
      expect(events.map((event) => [event.source, event.actor, event.result.ok])).toEqual([
        ['key', undefined, true],
        ['palette', undefined, true],
        ['menu', undefined, true],
        ['toolbar', undefined, true],
        ['agent', 'agent-7', true]
      ]);
      // The agent's context was built from the agent (5 selected), not the screen.
      expect(runs.at(-1)).toBe('archive:5:agent');
    } finally {
      context.dispose();
    }
  });

  it('an agent gets the same reason a person sees', async () => {
    const { context, commands, setLocked } = setup();
    try {
      commands.register<DeskCtx>({
        id: 'desk.rename',
        title: 'Rename',
        enabled: (ctx) => (ctx.locked ? { reason: 'The desk is locked' } : true),
        run: () => {}
      });
      setLocked(true);
      const person = commands.stateOf('desk.rename', { source: 'palette' });
      const agent = await commands.execute('desk.rename', undefined, { source: 'agent', actor: 'agent-7' });
      expect(person?.disabledReason).toBe('The desk is locked');
      expect(agent).toEqual({ ok: false, why: 'disabled', reason: 'The desk is locked' });
    } finally {
      context.dispose();
    }
  });

  it('agent: false hides a command from agents only', async () => {
    const { context, commands } = setup();
    try {
      commands.register({ id: 'desk.wipe', title: 'Wipe', agent: false, run: () => {} });
      expect(commands.listFor({ source: 'agent' }).map((state) => state.id)).toEqual([]);
      expect(commands.listFor({ source: 'palette' }).map((state) => state.id)).toEqual(['desk.wipe']);
      expect(await commands.execute('desk.wipe', undefined, { source: 'agent' })).toEqual({ ok: false, why: 'hidden' });
    } finally {
      context.dispose();
    }
  });

  describe('arguments', () => {
    const insertRows = (runs: unknown[]): CommandSpec<DeskCtx, { count: number; where: 'above' | 'below' }> => ({
      id: 'rows.insert',
      title: 'Insert rows',
      args: {
        count: { kind: 'number', label: 'Count', min: 1, max: 100 },
        where: {
          kind: 'choice',
          label: 'Where',
          options: () => [
            { value: 'above', label: 'Above' },
            { value: 'below', label: 'Below' }
          ],
          initial: () => 'below'
        }
      },
      run: (_ctx, args) => void runs.push(args)
    });

    it('agents and the API must pass required arguments; the message names the field', async () => {
      const { context, commands } = setup();
      try {
        const runs: unknown[] = [];
        commands.register(insertRows(runs));
        expect(await commands.execute('rows.insert', {}, { source: 'agent' })).toEqual({
          ok: false,
          why: 'failed',
          message: "Missing argument 'count'"
        });
        expect(await commands.execute('rows.insert', { count: 3 }, { source: 'agent' })).toEqual({ ok: true });
        // `initial` filled the choice the agent left out.
        expect(runs).toEqual([{ count: 3, where: 'below' }]);
      } finally {
        context.dispose();
      }
    });

    it('rejects values out of range or not among the choices', async () => {
      const { context, commands } = setup();
      try {
        commands.register(insertRows([]));
        const tooMany = await commands.execute('rows.insert', { count: 500 });
        expect(tooMany).toMatchObject({ ok: false, why: 'failed' });
        expect((tooMany as { message: string }).message).toMatch(/Count.*at most 100/);
        const sideways = await commands.execute('rows.insert', { count: 1, where: 'sideways' });
        expect((sideways as { message: string }).message).toMatch(/Where.*Above, Below/);
      } finally {
        context.dispose();
      }
    });

    it('a person is asked for missing arguments; dismissing the prompt cancels', async () => {
      const { context, commands } = setup();
      try {
        const runs: unknown[] = [];
        commands.register(insertRows(runs));
        const asked: string[][] = [];
        let answer: Record<string, unknown> | null = { count: 2 };
        commands.setArgsPrompt(async (request) => {
          asked.push([...request.missing]);
          return answer;
        });
        expect(await commands.execute('rows.insert', undefined, { source: 'palette' })).toEqual({ ok: true });
        expect(runs).toEqual([{ count: 2, where: 'below' }]);
        answer = null;
        expect(await commands.execute('rows.insert', undefined, { source: 'menu' })).toEqual({
          ok: false,
          why: 'cancelled'
        });
        expect(asked).toEqual([['count'], ['count']]);
        expect(runs).toHaveLength(1);
      } finally {
        context.dispose();
      }
    });
  });

  it('a throwing or rejecting run reports failed with its message', async () => {
    const { context, commands } = setup();
    try {
      commands.register({ id: 'boom', title: 'Boom', run: () => { throw new Error('kaboom'); } });
      commands.register({ id: 'later', title: 'Later', run: async () => { throw new Error('nope'); } });
      expect(await commands.execute('boom')).toEqual({ ok: false, why: 'failed', message: 'kaboom' });
      expect(await commands.execute('later')).toEqual({ ok: false, why: 'failed', message: 'nope' });
    } finally {
      context.dispose();
    }
  });

  it('describes state: computed title, shortcut from the first shown key, checked, reason', () => {
    const { context, commands, setSelected } = setup();
    try {
      const [bold, setBold] = createSignal(false);
      commands.register<DeskCtx>({
        id: 'text.bold',
        title: (ctx) => (ctx.selected > 1 ? `Bold ${ctx.selected} items` : 'Bold'),
        keys: [{ key: 'ctrl+b', display: false }, 'mod+b'],
        checked: () => bold(),
        enabled: (ctx) => (ctx.selected > 0 ? true : { reason: 'Nothing selected' }),
        run: () => {}
      });
      expect(commands.stateOf('text.bold')).toMatchObject({
        title: 'Bold',
        shortcut: formatCombo('mod+b'),
        keys: ['mod+b'],
        checked: false,
        disabledReason: 'Nothing selected'
      });
      setSelected(3);
      setBold(true);
      expect(commands.stateOf('text.bold')).toMatchObject({ title: 'Bold 3 items', checked: true });
      expect(commands.stateOf('text.bold')?.disabledReason).toBeUndefined();
    } finally {
      context.dispose();
    }
  });

  it('search skips palette: false and hidden commands, and sorts disabled last', () => {
    const { context, commands } = setup();
    try {
      commands.register({ id: 'a', title: 'Delete row', enabled: () => ({ reason: 'Locked' }), run: () => {} });
      commands.register({ id: 'b', title: 'Delete column', run: () => {} });
      commands.register({ id: 'c', title: 'Delete sheet', visible: () => false, run: () => {} });
      commands.register({ id: 'd', title: 'Delete next', palette: false, run: () => {} });
      expect(commands.search('del').map((state) => state.id)).toEqual(['b', 'a']);
      expect(commands.list().map((state) => state.id)).toEqual(['a', 'b', 'd']);
    } finally {
      context.dispose();
    }
  });

  it('menuItem carries the title, shortcut, reason, and runs with source menu', async () => {
    const { context, commands, setSelected } = setup();
    try {
      const runs: string[] = [];
      commands.register(archive(runs));
      const blocked = commands.menuItem('desk.archive', { target: 'row-1' });
      expect(blocked).toMatchObject({
        id: 'desk.archive',
        label: 'Archive',
        shortcut: formatCombo('mod+backspace'),
        disabled: true,
        disabledReason: 'Select an item first'
      });
      setSelected(1);
      commands.menuItem('desk.archive', { target: 'row-1' })!.run();
      expect(runs).toEqual(['archive:1:menu']);
      expect(commands.menuItem('missing')).toBeNull();
    } finally {
      context.dispose();
    }
  });
});

describe('keys linked to commands', () => {
  it('a hidden command’s key falls through to the next binding', () => {
    const { context, commands, keyboard } = setup();
    try {
      const runs: string[] = [];
      const [editing, setEditing] = createSignal(false);
      commands.register({ id: 'cell.commit', title: 'Commit', keys: ['enter'], visible: () => editing(), run: () => void runs.push('commit') });
      keyboard.register({ id: 'grid.down', key: 'enter', run: () => void runs.push('down') });
      keyboard.dispatch(keydown({ key: 'Enter' }));
      setEditing(true);
      keyboard.dispatch(keydown({ key: 'Enter' }));
      expect(runs).toEqual(['down', 'commit']);
    } finally {
      context.dispose();
    }
  });

  it('a disabled command consumes its key and shows the reason', () => {
    const { context, commands, keyboard, toasts } = setup();
    try {
      const runs: string[] = [];
      commands.register(archive(runs));
      keyboard.register({ id: 'other', key: 'ctrl+backspace', run: () => void runs.push('other') });
      const event = keydown({ key: 'Backspace', ctrlKey: true });
      expect(keyboard.dispatch(event)).toBe(true);
      expect(event.defaultPrevented).toBe(true);
      expect(runs).toEqual([]);
      expect(toasts.toasts.get().map((toast) => toast.text)).toEqual(['Select an item first']);
    } finally {
      context.dispose();
    }
  });

  it('commands.blockedKeyFeedback: none consumes the key without a toast', async () => {
    const context = new ServiceContext({
      scopeId: 'commands-quiet',
      config: defineWheelConfig({ commands: { blockedKeyFeedback: 'none' } })
    });
    try {
      const commands = context.get(CommandService);
      const keyboard = context.get(KeyboardService);
      commands.register({ id: 'locked', title: 'Locked', keys: ['mod+l'], enabled: () => ({ reason: 'Locked' }), run: () => {} });
      expect(keyboard.dispatch(keydown({ key: 'l', ctrlKey: true }))).toBe(true);
      expect(context.get(ToastService).toasts.get()).toEqual([]);
    } finally {
      context.dispose();
    }
  });

  it('keys for another platform are not bound', () => {
    const { context, commands, keyboard } = setup();
    try {
      commands.register({
        id: 'app.quit',
        title: 'Quit',
        keys: [
          { key: 'cmd+q', platform: 'mac' },
          { key: 'ctrl+q', platform: 'win' },
          { key: 'ctrl+q', platform: 'linux' }
        ],
        run: () => {}
      });
      // jsdom reports neither mac nor windows.
      expect(keyboard.registrations().map((binding) => binding.key)).toEqual(['ctrl+q']);
      expect(keyboard.registrations()[0].command).toBe('app.quit');
    } finally {
      context.dispose();
    }
  });
});

describe('conflicts', () => {
  it('reports same-scope, gated, and shadowed combos', () => {
    const conflicts = findConflicts(
      [
        { id: 'a', key: 'mod+shift+z', gated: false },
        { id: 'b', key: 'shift+mod+z', gated: false },
        { id: 'list.down', key: 'arrowdown', gated: true },
        { id: 'board.down', key: 'arrowdown', gated: true },
        { id: 'grid.enter', key: 'enter', scope: 'grid', gated: false },
        { id: 'editor.enter', key: 'enter', scope: 'editor', gated: false },
        { id: 'lonely', key: 'mod+k', gated: false }
      ],
      'win'
    );
    expect(conflicts).toEqual([
      { combo: 'mod+shift+z', ids: ['a', 'b'], scopes: [null, null], kind: 'same-scope' },
      { combo: 'arrowdown', ids: ['list.down', 'board.down'], scopes: [null, null], kind: 'gated' },
      { combo: 'enter', ids: ['grid.enter', 'editor.enter'], scopes: ['grid', 'editor'], kind: 'shadowed' }
    ]);
  });

  it('KeyboardService.conflicts counts a command key as gated by its visible rule', () => {
    const { context, commands, keyboard } = setup();
    try {
      commands.register({ id: 'one', title: 'One', keys: ['x'], run: () => {} });
      keyboard.register({ id: 'two', key: 'x', run: () => {} });
      expect(keyboard.conflicts()).toEqual([
        { combo: 'x', ids: ['command:one', 'two'], scopes: [null, null], kind: 'same-scope' }
      ]);
    } finally {
      context.dispose();
    }
  });
});

describe('<CommandPaletteSystem /> over the registry', () => {
  let commands!: CommandService;
  const connectProbe = connect('CommandsProbe', (c) => {
    commands = c.service(CommandService);
    return {};
  });
  function Probe() {
    connectProbe({});
    return null;
  }

  function mount() {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const dispose = render(
      () => (
        <ServiceProvider scopeId="commands-palette">
          <Probe />
          <KeyboardSystem />
          <CommandPaletteSystem />
        </ServiceProvider>
      ),
      host
    );
    return () => {
      dispose();
      host.remove();
    };
  }
  const input = () => document.querySelector('[data-testid=wheel-palette-input]') as HTMLInputElement | null;

  it('rows show the shortcut, the check, and a disabled reason; Enter on a disabled row does nothing', () => {
    const cleanup = mount();
    try {
      const runs: string[] = [];
      commands.register({ id: 'view.grid', title: 'Show grid', keys: ['mod+g'], checked: () => true, run: () => void runs.push('grid') });
      commands.register({ id: 'row.delete', title: 'Delete row', enabled: () => ({ reason: 'The sheet is locked' }), run: () => void runs.push('delete') });
      document.dispatchEvent(keydown({ key: 'k', ctrlKey: true }));
      expect(document.querySelector('[data-testid=wheel-palette-shortcut-view\\.grid]')?.textContent).toBe(formatCombo('mod+g'));
      expect(document.querySelector('[data-testid=wheel-palette-check-view\\.grid]')).not.toBeNull();
      const row = document.querySelector('[data-testid=wheel-palette-item-row\\.delete]')!;
      expect(row.getAttribute('aria-disabled')).toBe('true');
      expect(document.querySelector('[data-testid=wheel-palette-reason-row\\.delete]')?.textContent).toBe('The sheet is locked');

      input()!.value = 'delete';
      input()!.dispatchEvent(new Event('input', { bubbles: true }));
      input()!.dispatchEvent(keydown({ key: 'Enter' }));
      expect(runs).toEqual([]);
      expect(input()).not.toBeNull();

      input()!.value = 'grid';
      input()!.dispatchEvent(new Event('input', { bubbles: true }));
      input()!.dispatchEvent(keydown({ key: 'Enter' }));
      expect(runs).toEqual(['grid']);
      expect(input()).toBeNull();
    } finally {
      cleanup();
    }
  });
});
