import * as editorServer from 'wheel-chalk/server';
import * as graphServer from './src/graph/sync/graph.server';
import * as kanbanServer from './src/kanban/sync/kanban.server';
import * as sequencerServer from './src/sequencer/sync/sequencer.server';
import * as sheetServer from './src/sheet/sync/sheet.server';
import * as todosServer from './src/todos/sync/todos.server';
import { DEMO_SYNC_MODULES } from './src/sync-modules';

/** Build-time inputs for the six independent demo row contracts. */
export const DEMO_SCHEMA_SPEC_INPUTS = {
  editor: { syncModules: DEMO_SYNC_MODULES.editor, servers: [editorServer] },
  graph: { syncModules: DEMO_SYNC_MODULES.graph, servers: [graphServer] },
  kanban: { syncModules: DEMO_SYNC_MODULES.kanban, servers: [kanbanServer] },
  sequencer: { syncModules: DEMO_SYNC_MODULES.sequencer, servers: [sequencerServer] },
  sheet: { syncModules: DEMO_SYNC_MODULES.sheet, servers: [sheetServer] },
  todos: { syncModules: DEMO_SYNC_MODULES.todos, servers: [todosServer] }
} as const;
