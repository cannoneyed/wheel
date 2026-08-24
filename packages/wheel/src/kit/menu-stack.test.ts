/**
 * The menu stack model: push, pop, filter across levels, and the keys.
 *
 * Everything here runs with no DOM and no component — the point of a
 * headless model is that its rules are testable as rules.
 */
import { describe, expect, test, vi } from 'vitest';

import { createMenuStack, flattenLeaves, menuMatches, type MenuLevel } from './menu-stack';

/** A root that mirrors the editor's `/` menu: two groups and two leaves. */
function root(run = () => {}): MenuLevel {
  return {
    title: '',
    items: [
      { id: 'text', label: 'Text', run },
      {
        id: 'heading',
        label: 'Heading',
        submenu: {
          title: 'Heading',
          items: [
            { id: 'h1', label: 'Heading 1', run },
            { id: 'h2', label: 'Heading 2', run },
            { id: 'h3', label: 'Heading 3', run }
          ]
        }
      },
      {
        id: 'list',
        label: 'List',
        submenu: {
          title: 'List',
          items: [
            { id: 'bullet', label: 'Bulleted list', run },
            { id: 'number', label: 'Numbered list', run }
          ]
        }
      },
      { id: 'divider', label: 'Divider', run }
    ]
  };
}

describe('the stack', () => {
  test('starts at the root, with no title and nothing to go back to', () => {
    const stack = createMenuStack(root());
    expect(stack.state().title).toBeNull();
    expect(stack.state().items.map((item) => item.id)).toEqual([
      'text',
      'heading',
      'list',
      'divider'
    ]);
    expect(stack.pop()).toBe(false);
  });

  test('choosing a group pushes its level and names it in the header', () => {
    const stack = createMenuStack(root());
    expect(stack.choose(stack.state().items[1])).toBe('pushed');
    expect(stack.state().title).toBe('Heading');
    expect(stack.state().items.map((item) => item.id)).toEqual(['h1', 'h2', 'h3']);
  });

  test('pop returns to the level below, and the highlight resets', () => {
    const stack = createMenuStack(root());
    stack.choose(stack.state().items[1]);
    stack.move(2);
    expect(stack.state().index).toBe(2);
    expect(stack.pop()).toBe(true);
    expect(stack.state().title).toBeNull();
    expect(stack.state().index).toBe(0);
  });

  test('choosing an action runs it', () => {
    const run = vi.fn();
    const stack = createMenuStack(root(run));
    expect(stack.choose(stack.state().items[0])).toBe('ran');
    expect(run).toHaveBeenCalledTimes(1);
  });

  test('a toggle runs and reports that the menu stays open', () => {
    const toggle = vi.fn();
    const stack = createMenuStack({
      title: '',
      items: [{ id: 'header', label: 'Header row', checked: true, run: toggle }]
    });
    expect(stack.choose(stack.state().items[0])).toBe('toggled');
    expect(toggle).toHaveBeenCalledTimes(1);
  });
});

describe('the query searches every level', () => {
  test('a query flattens the tree to its leaves', () => {
    const stack = createMenuStack(root());
    stack.setQuery('heading');
    // "Heading" the GROUP is gone: a filtered list holds leaves only, or
    // the user would choose twice for one outcome.
    expect(stack.state().items.map((item) => item.id)).toEqual(['h1', 'h2', 'h3']);
  });

  test('a leaf inside a submenu is reachable without opening it', () => {
    const stack = createMenuStack(root());
    stack.setQuery('bulleted');
    expect(stack.state().items.map((item) => item.id)).toEqual(['bullet']);
  });

  test('keywords match beyond the label', () => {
    const stack = createMenuStack({
      title: '',
      items: [{ id: 'h1', label: 'Heading 1', keywords: ['title'], run: () => {} }]
    });
    stack.setQuery('title');
    expect(stack.state().items.map((item) => item.id)).toEqual(['h1']);
  });

  test('clearing the query returns to the level you stand on', () => {
    const stack = createMenuStack(root());
    stack.choose(stack.state().items[2]);
    stack.setQuery('head');
    expect(stack.state().items.map((item) => item.id)).toEqual(['h1', 'h2', 'h3']);
    stack.setQuery('');
    expect(stack.state().items.map((item) => item.id)).toEqual(['bullet', 'number']);
  });

  test('a push clears the query, so the submenu shows its own items', () => {
    const stack = createMenuStack(root());
    stack.setQuery('list');
    // The filtered list holds the two leaves; pushing from a filter would
    // otherwise show a submenu still narrowed by the text that led there.
    stack.push(root().items[2]!.submenu!);
    expect(stack.state().query).toBe('');
    expect(stack.state().items.map((item) => item.id)).toEqual(['bullet', 'number']);
  });

  /**
   * A widget level's items configure the widget. Reaching "Header row"
   * from a filter would flip a setting for a picker nobody is looking at.
   */
  test('the search stops at a widget level, and offers the widget itself', () => {
    const withPicker: MenuLevel = {
      title: '',
      items: [
        {
          id: 'table',
          label: 'Table',
          submenu: {
            title: 'Table',
            items: [{ id: 'headed', label: 'Header row', checked: true, run: () => {} }],
            grid: { rows: 5, columns: 8, choose: () => {} }
          }
        }
      ]
    };
    const stack = createMenuStack(withPicker);
    stack.setQuery('header');
    expect(stack.state().items).toEqual([]);
    stack.setQuery('table');
    expect(stack.state().items.map((item) => item.id)).toEqual(['table']);
  });

  test('narrowing a query clamps the highlight instead of resetting it', () => {
    const stack = createMenuStack(root());
    stack.setQuery('head');
    stack.move(2); // Heading 3
    stack.setQuery('headi'); // still all three
    expect(stack.state().index).toBe(2);
    stack.setQuery('heading 1'); // one left — clamp, not crash
    expect(stack.state().index).toBe(0);
  });

  test('menuMatches and flattenLeaves answer on their own', () => {
    expect(flattenLeaves(root()).map((item) => item.id)).toEqual([
      'text',
      'h1',
      'h2',
      'h3',
      'bullet',
      'number',
      'divider'
    ]);
    expect(menuMatches(root(), root(), 'div').map((item) => item.id)).toEqual(['divider']);
  });
});

describe('the keys', () => {
  test('down and up move the highlight and wrap', () => {
    const stack = createMenuStack(root());
    expect(stack.handleKey('ArrowDown')).toBe(true);
    expect(stack.state().index).toBe(1);
    expect(stack.handleKey('ArrowUp')).toBe(true);
    expect(stack.state().index).toBe(0);
    stack.handleKey('ArrowUp');
    expect(stack.state().index).toBe(3);
  });

  test('backspace pops a level when the query is empty', () => {
    const stack = createMenuStack(root());
    stack.choose(stack.state().items[1]);
    expect(stack.handleKey('Backspace')).toBe(true);
    expect(stack.state().title).toBeNull();
  });

  /**
   * A key that both deletes text and navigates is a key you cannot trust.
   * Inside a query Backspace belongs to the query, and the caller writes
   * the text — so the stack must decline it.
   */
  test('backspace inside a query belongs to the query', () => {
    const stack = createMenuStack(root());
    stack.choose(stack.state().items[1]);
    stack.setQuery('h');
    expect(stack.handleKey('Backspace')).toBe(false);
    expect(stack.state().title).toBe('Heading');
  });

  test('backspace at the root declines, so the host still deletes', () => {
    const stack = createMenuStack(root());
    expect(stack.handleKey('Backspace')).toBe(false);
  });

  test('left pops, like backspace', () => {
    const stack = createMenuStack(root());
    stack.choose(stack.state().items[1]);
    expect(stack.handleKey('ArrowLeft')).toBe(true);
    expect(stack.state().title).toBeNull();
  });
});

describe('the size grid', () => {
  const sized = (choose = (_rows: number, _columns: number) => {}): MenuLevel => ({
    title: 'Table',
    items: [{ id: 'header', label: 'Header row', checked: true, run: () => {} }],
    grid: { rows: 5, columns: 8, choose }
  });

  test('the arrows sweep the grid, and clamp at its edges', () => {
    const stack = createMenuStack(sized());
    // The first arrow lands on 1x1 — the smallest table, not a dead corner.
    stack.handleKey('ArrowDown');
    expect(stack.state().gridPoint).toEqual({ rows: 1, columns: 1 });
    stack.handleKey('ArrowRight');
    expect(stack.state().gridPoint).toEqual({ rows: 1, columns: 2 });
    for (let step = 0; step < 20; step += 1) {
      stack.handleKey('ArrowDown');
      stack.handleKey('ArrowRight');
    }
    expect(stack.state().gridPoint).toEqual({ rows: 5, columns: 8 });
  });

  test('choosing a size calls choose with the highlighted counts', () => {
    const choose = vi.fn();
    const stack = createMenuStack(sized(choose));
    stack.highlightGrid({ rows: 3, columns: 4 });
    expect(stack.chooseGrid()).toBe(true);
    expect(choose).toHaveBeenCalledWith(3, 4);
  });

  test('an empty highlight chooses nothing', () => {
    const choose = vi.fn();
    const stack = createMenuStack(sized(choose));
    expect(stack.chooseGrid()).toBe(false);
    expect(choose).not.toHaveBeenCalled();
  });

  test('a query hides the grid — a filter is a list', () => {
    const stack = createMenuStack(sized());
    expect(stack.state().grid).not.toBeNull();
    stack.setQuery('head');
    expect(stack.state().grid).toBeNull();
  });

  test('left at the grid origin pops the level instead of stalling', () => {
    const parent: MenuLevel = {
      title: '',
      items: [{ id: 'table', label: 'Table', submenu: sized() }]
    };
    const stack = createMenuStack(parent);
    stack.choose(stack.state().items[0]);
    expect(stack.state().title).toBe('Table');
    expect(stack.handleKey('ArrowLeft')).toBe(true);
    expect(stack.state().title).toBeNull();
  });
});

describe('onChange', () => {
  test('fires on every state change', () => {
    const changed = vi.fn();
    const stack = createMenuStack(root(), changed);
    stack.setQuery('h');
    stack.move(1);
    stack.reset();
    expect(changed).toHaveBeenCalledTimes(3);
  });
});

describe('a disabled entry', () => {
  test('refuses to run, and refuses to push', () => {
    const ran = vi.fn();
    const level: MenuLevel = {
      title: '',
      items: [
        { id: 'off', label: 'Align', run: ran, disabled: true, disabledReason: 'needs a header row' },
        { id: 'deep', label: 'More', submenu: { title: 'More', items: [] }, disabled: true }
      ]
    };
    const stack = createMenuStack(level);
    expect(stack.choose(stack.state().items[0])).toBeNull();
    expect(ran).not.toHaveBeenCalled();
    expect(stack.choose(stack.state().items[1])).toBeNull();
    // A refused push must leave the level it refused to leave.
    expect(stack.state().title).toBeNull();
  });

  test('stays visible and stays findable — hiding it teaches nothing', () => {
    const level: MenuLevel = {
      title: '',
      items: [{ id: 'off', label: 'Align', run: () => {}, disabled: true }]
    };
    const stack = createMenuStack(level);
    stack.setQuery('align');
    expect(stack.state().items.map((item) => item.id)).toEqual(['off']);
  });
});
