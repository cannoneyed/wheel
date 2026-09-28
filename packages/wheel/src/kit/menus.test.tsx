// @vitest-environment jsdom
/**
 * Menus from data: targets and slots resolve into a `MenuLevel` (headless),
 * and `<ContextMenuSystem/>` draws that level as stacked levels or as
 * flyouts, with the same keys, plus keyboard-opened menus at an element.
 */
import { describe, expect, it } from 'vitest';
import { createSignal } from 'solid-js';
import { render } from 'solid-js/web';

import { ServiceContext, connect } from '../core/index';
import { WheelContext } from '../core/context';
import type { Defer } from '../core/runtime-defaults';
import {
  CommandService,
  ContextMenuService,
  ContextMenuSystem,
  MenuService,
  OPEN_DELAY_MS,
  contextMenu,
  flattenLeaves,
  formatCombo,
  insideTriangle,
  type ExecuteEvent,
  type MenuAction,
  type MenuLevel,
  type SubmenuStyle
} from './index';

// Referenced so the `use:` directive import survives.
void contextMenu;

function keydown(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent('keydown', { cancelable: true, bubbles: true, ...init });
}

function setup() {
  const context = new ServiceContext({ scopeId: 'menus' });
  return { context, menus: context.get(MenuService), commands: context.get(CommandService) };
}

const ids = (level: MenuLevel) => level.items.map((item) => item.id);
const dividers = (level: MenuLevel) => level.items.filter((item) => item.separatorBefore).map((item) => item.id);

describe('MenuService.levelFor (headless)', () => {
  it('orders slots by the target, entries by order, and divides non-empty slots once', () => {
    const { context, menus, commands } = setup();
    try {
      for (const id of ['cut', 'copy', 'paste', 'rename', 'delete']) {
        commands.register({ id, title: id[0].toUpperCase() + id.slice(1), run: () => {} });
      }
      menus.defineTarget('cell', ['clipboard', 'empty', 'edit', 'danger'], { label: 'Cell menu' });
      menus.contribute({ target: 'cell', slot: 'danger', entry: { command: 'delete' } });
      menus.contribute({ target: 'cell', slot: 'clipboard', entry: { command: 'paste' }, order: 3 });
      menus.contribute({ target: 'cell', slot: 'clipboard', entry: { command: 'cut' }, order: 1 });
      menus.contribute({ target: 'cell', slot: 'clipboard', entry: { command: 'copy' }, order: 2 });
      menus.contribute({ target: 'cell', slot: 'edit', entry: { command: 'rename' } });

      const level = menus.levelFor('cell');
      expect(level.title).toBe('Cell menu');
      expect(ids(level)).toEqual(['cut', 'copy', 'paste', 'rename', 'delete']);
      // One divider per slot boundary; none at the top; the empty slot adds none.
      expect(dividers(level)).toEqual(['rename', 'delete']);
    } finally {
      context.dispose();
    }
  });

  it('takes title, shortcut, check, and reason from the registry; drops hidden commands', () => {
    const { context, menus, commands } = setup();
    try {
      commands.register({ id: 'grid', title: 'Show grid', keys: ['mod+g'], checked: () => true, run: () => {} });
      commands.register({ id: 'paste', title: 'Paste', enabled: () => ({ reason: 'The clipboard is empty' }), run: () => {} });
      commands.register({ id: 'secret', title: 'Secret', visible: () => false, run: () => {} });
      for (const command of ['grid', 'paste', 'secret']) {
        menus.contribute({ target: 'cell', slot: 'main', entry: { command } });
      }
      const [grid, paste] = menus.levelFor('cell').items as MenuAction[];
      expect(menus.levelFor('cell').items).toHaveLength(2);
      expect(grid).toMatchObject({ label: 'Show grid', shortcut: formatCombo('mod+g'), checked: true });
      expect(paste).toMatchObject({ disabled: true, disabledReason: 'The clipboard is empty' });
    } finally {
      context.dispose();
    }
  });

  it('a contribution’s when gates it; explicit dividers never double or sit at an edge', () => {
    const { context, menus, commands } = setup();
    try {
      const [locked, setLocked] = createSignal(false);
      for (const id of ['a', 'b', 'c']) commands.register({ id, title: id, run: () => {} });
      menus.contribute({ target: 't', slot: 's', entry: { separator: true } });
      menus.contribute({ target: 't', slot: 's', entry: { command: 'a' } });
      menus.contribute({ target: 't', slot: 's', entry: { separator: true } });
      menus.contribute({ target: 't', slot: 's', entry: { separator: true } });
      menus.contribute({ target: 't', slot: 's', entry: { command: 'b' }, when: () => !locked() });
      menus.contribute({ target: 't', slot: 's', entry: { command: 'c' } });
      menus.contribute({ target: 't', slot: 's', entry: { separator: true } });
      expect(ids(menus.levelFor('t'))).toEqual(['a', 'b', 'c']);
      expect(dividers(menus.levelFor('t'))).toEqual(['b']);
      setLocked(true);
      expect(ids(menus.levelFor('t'))).toEqual(['a', 'c']);
      expect(dividers(menus.levelFor('t'))).toEqual(['c']);
    } finally {
      context.dispose();
    }
  });

  it('a submenu entry nests another target; an empty one is dropped; a loop throws', () => {
    const { context, menus, commands } = setup();
    try {
      commands.register({ id: 'rows.above', title: 'Row above', run: () => {} });
      menus.contribute({ target: 'cell', slot: 'insert', entry: { submenu: 'cell.insert', label: 'Insert' } });
      menus.contribute({ target: 'cell', slot: 'insert', entry: { submenu: 'cell.nothing', label: 'Nothing' } });
      menus.contribute({ target: 'cell.insert', slot: 'rows', entry: { command: 'rows.above' } });
      const level = menus.levelFor('cell');
      expect(ids(level)).toEqual(['submenu:cell.insert']);
      expect(flattenLeaves(level).map((item) => item.id)).toEqual(['rows.above']);

      menus.contribute({ target: 'cell.insert', slot: 'loop', entry: { submenu: 'cell', label: 'Again' } });
      expect(() => menus.levelFor('cell')).toThrow(/contains itself/);
    } finally {
      context.dispose();
    }
  });

  it('runtime items show only on their instance, carry their source, and leave when removed', () => {
    const { context, menus } = setup();
    try {
      const picks: string[] = [];
      const stop = menus.contributeItems({
        target: 'widget',
        instance: 'cell-1',
        slot: 'extension',
        source: 'Image selector',
        items: [
          { id: 'approve', label: 'Approve', run: () => void picks.push('approve') },
          { id: 'next', label: 'Next variant', disabled: true, disabledReason: 'This is the last variant', run: () => {} },
          // Disabled with no reason: dropped.
          { id: 'mystery', label: 'Mystery', disabled: true, run: () => {} }
        ]
      });
      expect(ids(menus.levelFor('widget', { instance: 'cell-1' }))).toEqual(['approve', 'next']);
      expect(menus.levelFor('widget', { instance: 'cell-2' }).items).toEqual([]);
      expect((menus.levelFor('widget', { instance: 'cell-1' }).items[0] as MenuAction).source).toBe('Image selector');
      stop();
      expect(menus.levelFor('widget', { instance: 'cell-1' }).items).toEqual([]);
    } finally {
      context.dispose();
    }
  });

  it('command entries run through execute with source menu and the subject as target', () => {
    const { context, menus, commands } = setup();
    try {
      const events: ExecuteEvent[] = [];
      commands.onExecute((event) => events.push(event));
      commands.register({ id: 'rows.delete', title: 'Delete row', run: () => {} });
      menus.contribute({ target: 'row', slot: 'main', entry: { command: 'rows.delete' } });
      (menus.levelFor('row', { subject: { rowId: 'r7' } }).items[0] as MenuAction).run();
      expect(events.map((event) => [event.id, event.source, event.target])).toEqual([
        ['rows.delete', 'menu', { rowId: 'r7' }]
      ]);
    } finally {
      context.dispose();
    }
  });

  it('keeps a command entry’s check live after dividers are added', () => {
    const { context, menus, commands } = setup();
    try {
      const [on, setOn] = createSignal(false);
      commands.register({ id: 'a', title: 'A', run: () => {} });
      commands.register({ id: 'wrap', title: 'Wrap text', checked: () => on(), run: () => {} });
      menus.contribute({ target: 't', slot: 'one', entry: { command: 'a' } });
      menus.contribute({ target: 't', slot: 'two', entry: { command: 'wrap' } });
      const wrap = menus.levelFor('t').items[1] as MenuAction;
      expect(wrap.separatorBefore).toBe(true);
      expect(wrap.checked).toBe(false);
      setOn(true);
      expect(wrap.checked).toBe(true);
    } finally {
      context.dispose();
    }
  });
});

describe('insideTriangle', () => {
  it('holds inside and on the edges, not outside', () => {
    const a = { x: 0, y: 50 };
    const b = { x: 100, y: 0 };
    const c = { x: 100, y: 100 };
    expect(insideTriangle({ x: 50, y: 50 }, a, b, c)).toBe(true);
    expect(insideTriangle({ x: 100, y: 50 }, a, b, c)).toBe(true);
    expect(insideTriangle({ x: 10, y: 5 }, a, b, c)).toBe(false);
  });
});

/** A defer the test steps by hand. */
function manualDefer(): { defer: Defer; advance: (ms: number) => void } {
  let now = 0;
  let timers: Array<{ at: number; fn: () => void; live: boolean }> = [];
  return {
    defer: {
      schedule: (ms, fn) => {
        const timer = { at: now + ms, fn, live: true };
        timers.push(timer);
        return () => {
          timer.live = false;
        };
      }
    },
    advance: (ms) => {
      now += ms;
      const due = timers.filter((timer) => timer.live && timer.at <= now);
      timers = timers.filter((timer) => !due.includes(timer));
      for (const timer of due) timer.fn();
    }
  };
}

describe('<ContextMenuSystem /> data menus', () => {
  let services!: { menus: MenuService; commands: CommandService; contextMenus: ContextMenuService };
  const connectProbe = connect('DataMenuProbe', (c) => {
    services = {
      menus: c.service(MenuService),
      commands: c.service(CommandService),
      contextMenus: c.service(ContextMenuService)
    };
    return {};
  });
  function Probe() {
    connectProbe({});
    return null;
  }

  function mount(submenus: SubmenuStyle) {
    const clock = manualDefer();
    const context = new ServiceContext({ scopeId: `data-menu-${submenus}`, defer: clock.defer });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const dispose = render(
      () => (
        <WheelContext.Provider value={{ client: null, services: context }}>
          <Probe />
          <button
            data-testid="cell"
            use:contextMenu={{ id: 'cell:A1', target: 'cell', subject: () => ({ cell: 'A1' }), instance: 'A1' }}
          >
            A1
          </button>
          <ContextMenuSystem submenus={submenus} />
        </WheelContext.Provider>
      ),
      host
    );
    const runs: Array<{ id: string; openDuringRun: boolean; target: unknown }> = [];
    const { menus, commands, contextMenus } = services;
    menus.defineTarget('cell', ['clipboard', 'insert'], { label: 'Cell menu' });
    for (const [id, title] of [
      ['copy', 'Copy'],
      ['rows.above', 'Row above'],
      ['rows.below', 'Row below']
    ] as const) {
      commands.register({
        id,
        title,
        run: (ctx) => void runs.push({ id, openDuringRun: contextMenus.openId() !== null, target: ctx.target })
      });
    }
    menus.contribute({ target: 'cell', slot: 'clipboard', entry: { command: 'copy' } });
    menus.contribute({ target: 'cell', slot: 'insert', entry: { submenu: 'cell.insert', label: 'Insert' } });
    menus.contribute({ target: 'cell.insert', slot: 'rows', entry: { command: 'rows.above' } });
    menus.contribute({ target: 'cell.insert', slot: 'rows', entry: { command: 'rows.below' } });
    return {
      host,
      runs,
      clock,
      cell: host.querySelector('[data-testid=cell]') as HTMLButtonElement,
      cleanup: () => {
        dispose();
        context.dispose();
        host.remove();
      }
    };
  }

  const menu = () => document.querySelector('[data-testid=wheel-context-menu]') as HTMLElement | null;
  const press = (key: string, init: KeyboardEventInit = {}) =>
    (document.activeElement ?? document.body).dispatchEvent(keydown({ key, ...init }));
  const active = () => document.activeElement?.getAttribute('data-testid');

  // The same keys, the same result, in both styles.
  for (const style of ['stacked', 'flyout'] as const) {
    it(`${style}: keys walk into a submenu and run a command, closing the menu first`, () => {
      const { cell, runs, cleanup } = mount(style);
      try {
        cell.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 20, clientY: 20 }));
        expect(menu()?.getAttribute('aria-label')).toBe('Cell menu');
        expect(document.querySelector('[data-testid=wheel-data-menu]')?.getAttribute('data-submenus')).toBe(style);
        expect(active()).toBe('wheel-menu-item-copy');

        press('ArrowDown');
        expect(active()).toBe('wheel-menu-item-submenu:cell.insert');
        press('ArrowRight');
        expect(active()).toBe('wheel-menu-item-rows.above');
        // The flyout keeps the parent panel open beside the child.
        expect(document.querySelector('[data-testid=wheel-menu-level-1]') !== null).toBe(style === 'flyout');

        press('ArrowLeft');
        expect(active()).toBe('wheel-menu-item-submenu:cell.insert');
        press('Enter');
        press('ArrowDown');
        expect(active()).toBe('wheel-menu-item-rows.below');
        press('Enter');
        expect(runs).toEqual([{ id: 'rows.below', openDuringRun: false, target: { cell: 'A1' } }]);
        expect(menu()).toBeNull();
      } finally {
        cleanup();
      }
    });

    it(`${style}: Escape closes one level, then the menu`, () => {
      const { cell, cleanup } = mount(style);
      try {
        cell.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
        press('ArrowDown');
        press('ArrowRight');
        press('Escape');
        expect(menu()).not.toBeNull();
        expect(active()).toBe('wheel-menu-item-submenu:cell.insert');
        press('Escape');
        expect(menu()).toBeNull();
      } finally {
        cleanup();
      }
    });
  }

  it('flyout: hovering a group opens its submenu after the delay', () => {
    const { cell, clock, cleanup } = mount('flyout');
    try {
      cell.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      const group = document.querySelector('[data-testid="wheel-menu-item-submenu:cell.insert"]')!;
      group.dispatchEvent(new MouseEvent('pointerenter'));
      expect(document.querySelector('[data-testid=wheel-menu-level-1]')).toBeNull();
      clock.advance(OPEN_DELAY_MS);
      expect(document.querySelector('[data-testid=wheel-menu-level-1]')).not.toBeNull();
      // Back on a plain row: the submenu closes.
      document.querySelector('[data-testid=wheel-menu-item-copy]')!.dispatchEvent(new MouseEvent('pointerenter'));
      expect(document.querySelector('[data-testid=wheel-menu-level-1]')).toBeNull();
    } finally {
      cleanup();
    }
  });

  it('Shift+F10 opens at the focused element with the first item focused; the Menu key too', () => {
    const { cell, cleanup } = mount('stacked');
    try {
      cell.focus();
      cell.dispatchEvent(keydown({ key: 'F10', shiftKey: true }));
      expect(menu()).not.toBeNull();
      expect(services.contextMenus.openedAtElement()).toBe(true);
      expect(active()).toBe('wheel-menu-item-copy');
      press('Escape');
      expect(menu()).toBeNull();
      // Focus came back to the cell.
      expect(document.activeElement).toBe(cell);

      cell.dispatchEvent(keydown({ key: 'ContextMenu' }));
      expect(menu()).not.toBeNull();
      // The Menu key's own contextmenu event, at browser-specific
      // coordinates, is swallowed instead of reopening at a point.
      cell.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 0, clientY: 0 }));
      expect(services.contextMenus.openedAtElement()).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('openAt opens any registered menu at an element', () => {
    const { host, cleanup } = mount('stacked');
    try {
      const other = document.createElement('div');
      host.appendChild(other);
      services.contextMenus.openAt('cell:A1', other);
      expect(menu()).not.toBeNull();
      expect(active()).toBe('wheel-menu-item-copy');
    } finally {
      cleanup();
    }
  });
});
