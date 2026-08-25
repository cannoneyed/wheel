// @vitest-environment jsdom
/**
 * The command palette's contract: commands as data — registration
 * (constructor + addCleanup pattern), search ranking (title prefix > title
 * substring > keyword), when() visibility, headless run-by-id — plus the
 * mounted system: mod+k opens, typing filters, arrows move the selection,
 * Enter runs, Escape closes, focus is restored.
 */
import { describe, expect, it } from 'vitest';
import { createSignal } from 'solid-js';
import { render } from 'solid-js/web';

import { Service, ServiceContext, ServiceProvider, connect } from '../core/index';
import {
  CommandPaletteService,
  CommandPaletteSystem,
  KeyboardSystem,
  groupCommands
} from './index';

function keydown(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent('keydown', { cancelable: true, bubbles: true, ...init });
}

describe('CommandPaletteService (headless)', () => {
  function setup() {
    const context = new ServiceContext({ scopeId: 'palette' });
    return { context, paletteService: context.get(CommandPaletteService) };
  }

  it('registers and unregisters commands; duplicate ids name both sites', () => {
    const { context, paletteService } = setup();
    try {
      const unregister = paletteService.registerCommand({ id: 'a', title: 'First', run: () => {} });
      paletteService.registerCommand({ id: 'b', title: 'Second', run: () => {} });
      expect(paletteService.commands().map((c) => c.title)).toEqual(['First', 'Second']);

      expect(() =>
        paletteService.registerCommand({ id: 'b', title: 'Second v2', run: () => {} })
      ).toThrow(/Duplicate command id 'b'.*First registered at.*duplicate registered at/);
      expect(paletteService.commands().map((c) => c.title)).toEqual(['First', 'Second']);

      unregister();
      expect(paletteService.commands().map((c) => c.id)).toEqual(['b']);
    } finally {
      context.dispose();
    }
  });

  it('ranks search results: title prefix > title substring > keyword', () => {
    const { context, paletteService } = setup();
    try {
      paletteService.registerCommand({ id: 'k', title: 'Remove card', keywords: ['delete'], run: () => {} });
      paletteService.registerCommand({ id: 's', title: 'Undelete card', run: () => {} });
      paletteService.registerCommand({ id: 'p', title: 'Delete column', run: () => {} });
      paletteService.registerCommand({ id: 'x', title: 'Rename board', run: () => {} });

      expect(paletteService.search('DEL').map((c) => c.id)).toEqual(['p', 's', 'k']);
      // Empty query: everything visible, registration order.
      expect(paletteService.search('').map((c) => c.id)).toEqual(['k', 's', 'p', 'x']);
      expect(paletteService.search('zzz')).toEqual([]);
    } finally {
      context.dispose();
    }
  });

  it('when() reactively hides commands from commands(), search(), and run()', () => {
    const { context, paletteService } = setup();
    try {
      const [armed, setArmed] = createSignal(false);
      const runs: string[] = [];
      paletteService.registerCommand({ id: 'always', title: 'Always', run: () => runs.push('always') });
      paletteService.registerCommand({ id: 'gated', title: 'Gated', when: armed, run: () => runs.push('gated') });

      expect(paletteService.commands().map((c) => c.id)).toEqual(['always']);
      expect(paletteService.search('gated')).toEqual([]);
      paletteService.run('gated'); // hidden: must not run
      expect(runs).toEqual([]);

      setArmed(true);
      expect(paletteService.commands().map((c) => c.id)).toEqual(['always', 'gated']);
      paletteService.run('gated');
      expect(runs).toEqual(['gated']);
    } finally {
      context.dispose();
    }
  });

  it('run(id) closes the palette then runs; unknown ids are a no-op', () => {
    const { context, paletteService } = setup();
    try {
      const observedOpenDuringRun: boolean[] = [];
      paletteService.registerCommand({
        id: 'probe',
        title: 'Probe',
        run: () => observedOpenDuringRun.push(paletteService.isOpen.get())
      });
      paletteService.open();
      expect(paletteService.isOpen.get()).toBe(true);
      paletteService.run('probe');
      expect(observedOpenDuringRun).toEqual([false]); // closed before running
      expect(paletteService.isOpen.get()).toBe(false);

      paletteService.open();
      paletteService.run('missing');
      expect(paletteService.isOpen.get()).toBe(true); // unknown id: nothing happens
      paletteService.close();
      expect(paletteService.isOpen.get()).toBe(false);
    } finally {
      context.dispose();
    }
  });

  it('remembers the last command run; a failed run does not', () => {
    const { context, paletteService } = setup();
    try {
      paletteService.registerCommand({ id: 'a', title: 'First', run: () => {} });
      expect(paletteService.lastRunId.get()).toBe(null);
      paletteService.run('a');
      expect(paletteService.lastRunId.get()).toBe('a');
      paletteService.run('missing');
      expect(paletteService.lastRunId.get()).toBe('a');
    } finally {
      context.dispose();
    }
  });
});

describe('groupCommands', () => {
  const command = (id: string, group?: string) => ({ id, title: id, group, run: () => {} });

  it('keeps rank order, and a group takes the place of its best member', () => {
    const grouped = groupCommands([
      command('a', 'Go to'),
      command('b'),
      command('c', 'Session'),
      command('d', 'Go to'),
      command('e')
    ]);
    expect(grouped.map((entry) => entry.group)).toEqual(['Go to', null, 'Session']);
    expect(grouped.map((entry) => entry.commands.map((c) => c.id))).toEqual([
      ['a', 'd'],
      ['b', 'e'],
      ['c']
    ]);
  });

  it('an ungrouped list is one nameless group; an empty list is no groups', () => {
    const grouped = groupCommands([command('a'), command('b')]);
    expect(grouped.map((entry) => entry.group)).toEqual([null]);
    expect(grouped[0].commands.map((c) => c.id)).toEqual(['a', 'b']);
    expect(groupCommands([])).toEqual([]);
  });
});

// The data-flavored contribution pattern: a feature service registers its
// commands in its constructor, paired with addCleanup.
class DeckService extends Service {
  /** Identity that survives minification (see require-service-name). */
  static override serviceName = 'DeckService';

  readonly played = this.atom<readonly string[]>([], 'played');

  constructor(context: ServiceContext) {
    super(context);
    const paletteService = this.service(CommandPaletteService);
    this.addCleanup(
      paletteService.registerCommand({
        id: 'deck.shuffle',
        title: 'Shuffle deck',
        keywords: ['randomize'],
        run: () => this.played.update((draft) => void draft.push('shuffle'))
      })
    );
    this.addCleanup(
      paletteService.registerCommand({
        id: 'deck.deal',
        title: 'Deal cards',
        run: () => this.played.update((draft) => void draft.push('deal'))
      })
    );
  }
}

describe('<CommandPaletteSystem /> (integration)', () => {
  let deckService!: DeckService;
  const connectDeckProbe = connect('DeckProbe', (c) => {
    deckService = c.service(DeckService);
    return {};
  });
  function DeckProbe() {
    connectDeckProbe({});
    return null;
  }

  function mountSystems() {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const dispose = render(
      () => (
        <ServiceProvider scopeId="palette-dom">
          <DeckProbe />
          <button data-testid="outside">outside</button>
          <KeyboardSystem />
          <CommandPaletteSystem />
        </ServiceProvider>
      ),
      host
    );
    return {
      host,
      cleanup: () => {
        dispose();
        host.remove();
      }
    };
  }

  const paletteInput = () => document.querySelector('[data-testid=wheel-palette-input]') as HTMLInputElement | null;

  it('mod+k opens (focusing the input), typing filters, Enter runs and closes', () => {
    const { host, cleanup } = mountSystems();
    try {
      const outside = host.querySelector('[data-testid=outside]') as HTMLButtonElement;
      outside.focus();
      expect(paletteInput()).toBeNull();

      // jsdom is not a mac platform, so mod+k arrives as ctrl+k.
      document.dispatchEvent(keydown({ key: 'k', ctrlKey: true }));
      const input = paletteInput();
      expect(input).not.toBeNull();
      expect(document.activeElement).toBe(input);
      expect(document.querySelectorAll('[role=option]').length).toBe(2);

      input!.value = 'shuf';
      input!.dispatchEvent(new Event('input', { bubbles: true }));
      expect(document.querySelectorAll('[role=option]').length).toBe(1);

      input!.dispatchEvent(keydown({ key: 'Enter' }));
      expect(deckService.played.get()).toEqual(['shuffle']);
      expect(paletteInput()).toBeNull();
      // Focus went back to the pre-open element.
      expect(document.activeElement).toBe(outside);
    } finally {
      cleanup();
    }
  });

  it('arrow keys move the selection; Enter runs the selected command', () => {
    const { cleanup } = mountSystems();
    try {
      document.dispatchEvent(keydown({ key: 'k', ctrlKey: true }));
      const input = paletteInput()!;
      const listboxId = input.getAttribute('aria-controls');
      expect(input.getAttribute('role')).toBe('combobox');
      expect(input.getAttribute('aria-expanded')).toBe('true');
      expect(document.getElementById(listboxId!)?.getAttribute('role')).toBe('listbox');
      expect(input.getAttribute('aria-activedescendant')).toBe('wheel-command-option-deck.shuffle');
      expect(
        document.querySelector('[role=option][aria-selected=true]')?.getAttribute('data-testid')
      ).toBe('wheel-palette-item-deck.shuffle');

      input.dispatchEvent(keydown({ key: 'ArrowDown' }));
      expect(input.getAttribute('aria-activedescendant')).toBe('wheel-command-option-deck.deal');
      expect(
        document.querySelector('[role=option][aria-selected=true]')?.getAttribute('data-testid')
      ).toBe('wheel-palette-item-deck.deal');

      input.dispatchEvent(keydown({ key: 'Enter' }));
      expect(deckService.played.get()).toEqual(['deal']);
      expect(paletteInput()).toBeNull();
    } finally {
      cleanup();
    }
  });

  // Two palette combos, because both are muscle memory: mod+k from Linear
  // and Slack, mod+shift+p from VS Code.
  it('mod+shift+p toggles the palette too, and each combo closes the other', () => {
    const { cleanup } = mountSystems();
    try {
      // jsdom is not a mac platform, so mod arrives as ctrl.
      document.dispatchEvent(keydown({ key: 'P', ctrlKey: true, shiftKey: true }));
      expect(paletteInput()).not.toBeNull();
      document.dispatchEvent(keydown({ key: 'P', ctrlKey: true, shiftKey: true }));
      expect(paletteInput()).toBeNull();

      // Opened by one, closed by the other: one palette, two doors.
      document.dispatchEvent(keydown({ key: 'k', ctrlKey: true }));
      expect(paletteInput()).not.toBeNull();
      paletteInput()!.dispatchEvent(keydown({ key: 'P', ctrlKey: true, shiftKey: true }));
      expect(paletteInput()).toBeNull();

      // Modifiers match exactly, so plain mod+p is somebody else's shortcut.
      document.dispatchEvent(keydown({ key: 'p', ctrlKey: true }));
      expect(paletteInput()).toBeNull();
      expect(deckService.played.get()).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it('Escape and mod+k (even from the input) both close without running', () => {
    const { cleanup } = mountSystems();
    try {
      document.dispatchEvent(keydown({ key: 'k', ctrlKey: true }));
      expect(paletteInput()).not.toBeNull();
      paletteInput()!.dispatchEvent(keydown({ key: 'Escape' }));
      expect(paletteInput()).toBeNull();

      document.dispatchEvent(keydown({ key: 'k', ctrlKey: true }));
      expect(paletteInput()).not.toBeNull();
      // The toggle binding opts into inInputs, so it fires from the input.
      paletteInput()!.dispatchEvent(keydown({ key: 'k', ctrlKey: true }));
      expect(paletteInput()).toBeNull();
      expect(deckService.played.get()).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it('scrim pointerdown closes; clicking a result runs it', () => {
    const { cleanup } = mountSystems();
    try {
      document.dispatchEvent(keydown({ key: 'k', ctrlKey: true }));
      document
        .querySelector('[data-testid=wheel-palette-overlay]')!
        .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      expect(paletteInput()).toBeNull();

      document.dispatchEvent(keydown({ key: 'k', ctrlKey: true }));
      (document.querySelector('[data-testid=wheel-palette-item-deck\\.deal]') as HTMLElement).click();
      expect(deckService.played.get()).toEqual(['deal']);
      expect(paletteInput()).toBeNull();
    } finally {
      cleanup();
    }
  });
});

describe('<CommandPaletteSystem /> described rows', () => {
  let paletteService!: CommandPaletteService;
  const connectRowProbe = connect('RowProbe', (c) => {
    paletteService = c.service(CommandPaletteService);
    return {};
  });
  function RowProbe() {
    connectRowProbe({});
    return null;
  }

  function mountRows() {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const dispose = render(
      () => (
        <ServiceProvider scopeId="palette-rows">
          <RowProbe />
          <KeyboardSystem />
          <CommandPaletteSystem />
        </ServiceProvider>
      ),
      host
    );
    // Registration order deliberately interleaves the groups, so the render
    // proves it gathers them rather than echoing the order it was given.
    paletteService.registerCommand({ id: 'plain', title: 'New issue', run: () => {} });
    paletteService.registerCommand({
      id: 'goto.issues',
      title: 'Issues',
      group: 'Go to',
      subtitle: 'The project',
      icon: () => <svg data-testid="issues-icon" />,
      run: () => {}
    });
    paletteService.registerCommand({ id: 'session.docs', title: 'Docs', group: 'Session', run: () => {} });
    paletteService.registerCommand({ id: 'goto.source', title: 'Source', group: 'Go to', run: () => {} });
    return {
      cleanup: () => {
        dispose();
        host.remove();
      }
    };
  }

  const paletteInput = () => document.querySelector('[data-testid=wheel-palette-input]') as HTMLInputElement | null;
  const renderedIds = () =>
    [...document.querySelectorAll('[role=option]')].map((node) => node.getAttribute('data-testid'));

  it('renders group headings, subtitles and icons, and gathers a group under one heading', () => {
    const { cleanup } = mountRows();
    try {
      document.dispatchEvent(keydown({ key: 'k', ctrlKey: true }));
      expect([...document.querySelectorAll('[role=group]')].map((n) => n.getAttribute('aria-label'))).toEqual([
        null,
        'Go to',
        'Session'
      ]);
      expect(document.querySelector('[data-testid="wheel-palette-group-Go to"]')?.textContent).toBe('Go to');
      expect(document.querySelector('[data-testid=wheel-palette-item-goto\\.issues]')?.textContent).toBe(
        'IssuesThe project'
      );
      expect(document.querySelector('[data-testid=issues-icon]')).not.toBeNull();
      // Both "Go to" commands sit under the one heading, in ranked order.
      expect(renderedIds()).toEqual([
        'wheel-palette-item-plain',
        'wheel-palette-item-goto.issues',
        'wheel-palette-item-goto.source',
        'wheel-palette-item-session.docs'
      ]);
    } finally {
      cleanup();
    }
  });

  it('arrow keys walk the RENDERED order, across group headings', () => {
    const { cleanup } = mountRows();
    try {
      document.dispatchEvent(keydown({ key: 'k', ctrlKey: true }));
      const input = paletteInput()!;
      expect(input.getAttribute('aria-activedescendant')).toBe('wheel-command-option-plain');
      input.dispatchEvent(keydown({ key: 'ArrowDown' }));
      input.dispatchEvent(keydown({ key: 'ArrowDown' }));
      // Third row: the second command of the "Go to" group, not the third
      // command registered. Grouping moved it, and the selection followed.
      expect(input.getAttribute('aria-activedescendant')).toBe('wheel-command-option-goto.source');
      expect(document.querySelector('[role=option][aria-selected=true]')?.getAttribute('data-testid')).toBe(
        'wheel-palette-item-goto.source'
      );
    } finally {
      cleanup();
    }
  });
});
