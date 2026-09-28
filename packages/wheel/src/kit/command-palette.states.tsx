/**
 * CommandPaletteSystem's enumerated states — open with results, open with no
 * matches, closed. The overlay/keyboard actions are inert spies: the states
 * show the CHROME; real dispatch belongs to integration tests.
 */
import { defineStates } from '../core/states';

import { CommandPaletteSystem, connectCommandPaletteSystem, type Command } from './command-palette';
import type { CommandState } from './commands';

const command = (id: string, title: string, keywords?: readonly string[]): Command => ({
  id,
  title,
  keywords,
  run: () => {}
});

const COMMANDS: Command[] = [
  command('board.addColumn', 'Add column'),
  command('board.clearDone', 'Clear completed cards', ['delete', 'done']),
  command('app.toggleTheme', 'Toggle theme', ['dark', 'light'])
];

/** A dot stands in for a real icon set — the states file owns no glyphs. */
const dot = () => (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    <circle cx="8" cy="8" r="4" fill="currentColor" />
  </svg>
);

const DESCRIBED: Command[] = [
  { ...command('board.addColumn', 'Add column'), subtitle: 'At the end of the board', icon: dot },
  { ...command('app.toggleTheme', 'Toggle theme', ['dark', 'light']), subtitle: 'Dark and light' },
  { ...command('go.board', 'Board'), group: 'Go to', icon: dot },
  { ...command('go.archive', 'Archive'), group: 'Go to', subtitle: 'Cards you finished', icon: dot },
  { ...command('card.rename', 'Rename card'), group: 'This card' }
];

/** Rows as the registry describes them: shortcut text, a check, a reason. */
const STATEFUL: CommandState[] = [
  { id: 'edit.undo', title: 'Undo', shortcut: '⌘Z', keys: ['mod+z'] },
  { id: 'view.grid', title: 'Show gridlines', checked: true, shortcut: '⇧⌘G', keys: ['mod+shift+g'] },
  { id: 'rows.insert', title: 'Insert row above', shortcut: '⌘↩', keys: ['mod+enter'] },
  {
    id: 'rows.delete',
    title: 'Delete row',
    shortcut: '⌘-',
    keys: ['mod+-'],
    disabledReason: 'The sheet is locked'
  }
];

const inertOverlay = (): (() => void) => () => {};

/** CommandPaletteSystem states: open with results, open with no matches, closed. */
export default defineStates({
  name: 'CommandPaletteSystem',
  component: CommandPaletteSystem,
  connection: connectCommandPaletteSystem,
  states: {
    'open with results': {
      note: 'mod+k look: every registered command listed',
      shape: {
        isOpen: true,
        lastRunId: null,
        openKeys: ['mod+k'],
        resultsFor: () => COMMANDS,
        open: () => {},
        close: () => {},
        run: () => {},
        registerBinding: () => () => {},
        enterOverlay: inertOverlay,
        trapOverlayTab: () => false
      }
    },
    'open, grouped rows': {
      note: 'a described command: group heading, subtitle, icon',
      shape: {
        isOpen: true,
        lastRunId: null,
        openKeys: ['mod+k'],
        resultsFor: () => DESCRIBED,
        open: () => {},
        close: () => {},
        run: () => {},
        registerBinding: () => () => {},
        enterOverlay: inertOverlay,
        trapOverlayTab: () => false
      }
    },
    'open, shortcuts and disabled rows': {
      note: 'registry rows: shortcut text, a checked toggle, a disabled row with its reason (sorted last)',
      shape: {
        isOpen: true,
        lastRunId: null,
        openKeys: ['mod+k'],
        resultsFor: () => STATEFUL,
        open: () => {},
        close: () => {},
        run: () => {},
        registerBinding: () => () => {},
        enterOverlay: inertOverlay,
        trapOverlayTab: () => false
      }
    },
    'open, no matches': {
      shape: {
        isOpen: true,
        lastRunId: null,
        openKeys: ['mod+k'],
        resultsFor: () => [],
        open: () => {},
        close: () => {},
        run: () => {},
        registerBinding: () => () => {},
        enterOverlay: inertOverlay,
        trapOverlayTab: () => false
      }
    },
    closed: {
      note: 'renders nothing',
      shape: {
        isOpen: false,
        lastRunId: null,
        openKeys: ['mod+k'],
        resultsFor: () => [],
        open: () => {},
        close: () => {},
        run: () => {},
        registerBinding: () => () => {},
        enterOverlay: inertOverlay,
        trapOverlayTab: () => false
      }
    }
  }
});
