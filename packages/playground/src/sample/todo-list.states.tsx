/**
 * TodoList's enumerated states — the exemplar `*.states.tsx` file: name the
 * component, hand it its connection, and enumerate shapes. The compiler
 * holds every fixture to the manifest; the playground renders each state at
 * `#/states/TodoList/<state>`.
 */
import { defineStates } from 'wheel/core';
import type { QueryStatus } from 'wheel/sync';

import { TodoList, connectTodoList } from './todo-list';
import type { Todo } from './todos.sync';

const LIVE: QueryStatus = { kind: 'live' };
const todo = (id: string, title: string, done: boolean): Todo => ({ id, title, done }) as Todo;
const noop = (): void => {};

/** TodoList states: a mixed list, the empty list, and first-load. */
export default defineStates({
  name: 'TodoList',
  component: TodoList,
  connection: connectTodoList,
  states: {
    'three todos, one done': {
      shape: {
        rows: [todo('a', 'write the states file', true), todo('b', 'render it', false), todo('c', 'ship it', false)],
        status: LIVE,
        remaining: 2,
        add: noop,
        toggle: noop
      }
    },
    empty: {
      shape: { rows: [], status: LIVE, remaining: 0, add: noop, toggle: noop }
    },
    loading: {
      note: 'first load — no rows yet',
      shape: { rows: [], status: { kind: 'loading' } as QueryStatus, remaining: 0, add: noop, toggle: noop }
    }
  }
});
