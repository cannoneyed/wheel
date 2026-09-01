import * as editorSync from 'wheel-chalk/sync';
import * as graphSync from './graph/sync/graph.sync';
import * as kanbanSync from './kanban/sync/kanban.sync';
import * as sequencerSync from './sequencer/sync/sequencer.sync';
import * as sheetSync from './sheet/sync/sheet.sync';
import * as todosSync from './todos/sync/todos.sync';

/** Client-safe declaration modules for each independent demo. */
export const DEMO_SYNC_MODULES = {
  editor: [editorSync],
  graph: [graphSync],
  kanban: [kanbanSync],
  sequencer: [sequencerSync],
  sheet: [sheetSync],
  todos: [todosSync]
} as const;
