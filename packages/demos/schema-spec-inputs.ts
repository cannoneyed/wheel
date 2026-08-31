import * as editorServer from './src/editor/sync/editor.server';
import * as editorSync from './src/editor/sync/editor.sync';
import * as graphServer from './src/graph/sync/graph.server';
import * as graphSync from './src/graph/sync/graph.sync';
import * as kanbanServer from './src/kanban/sync/kanban.server';
import * as kanbanSync from './src/kanban/sync/kanban.sync';
import * as sequencerServer from './src/sequencer/sync/sequencer.server';
import * as sequencerSync from './src/sequencer/sync/sequencer.sync';
import * as sheetServer from './src/sheet/sync/sheet.server';
import * as sheetSync from './src/sheet/sync/sheet.sync';
import * as todosServer from './src/todos/sync/todos.server';
import * as todosSync from './src/todos/sync/todos.sync';

/** Build-time inputs for the six independent demo row contracts. */
export const DEMO_SCHEMA_SPEC_INPUTS = {
  editor: { syncModules: [editorSync], servers: [editorServer] },
  graph: { syncModules: [graphSync], servers: [graphServer] },
  kanban: { syncModules: [kanbanSync], servers: [kanbanServer] },
  sequencer: { syncModules: [sequencerSync], servers: [sequencerServer] },
  sheet: { syncModules: [sheetSync], servers: [sheetServer] },
  todos: { syncModules: [todosSync], servers: [todosServer] }
} as const;
