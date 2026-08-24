// @vitest-environment node
/**
 * The todos vertical against a real in-process engine: optimistic add/toggle,
 * two-client convergence, and the service-layer computeds.
 */
import { describe, expect, test } from 'vitest';

import { ServiceContext } from 'wheel/core';
import { World } from 'wheel/testing';
import { TodoService } from './services/todo-service';
import * as todosSync from './sync/todos.sync';
import * as todosServer from './sync/todos.server';
import { TODOS_SCHEMA } from './sync/todos.server';

async function makeWorld(): Promise<World> {
  return World.create({
    syncModules: [todosSync],
    servers: [todosServer],
    setup: async (db) => {
      for (const statement of [...TODOS_SCHEMA.create, ...TODOS_SCHEMA.seed]) {
        await db.query(statement);
      }
    }
  });
}

describe('todos demo', () => {
  test('two clients converge through the service layer', async () => {
    const world = await makeWorld();
    const [a, b] = await world.twoClients('web_a', 'web_b');

    const serviceA = new ServiceContext({ client: a }).get(TodoService);
    const serviceB = new ServiceContext({ client: b }).get(TodoService);
    await a.subscribe(todosSync.todoList, {});
    await b.subscribe(todosSync.todoList, {});

    serviceA.add('from client A');
    // Optimistic: A sees it instantly; B doesn't yet.
    expect(serviceA.list.rows.some((todo) => todo.text === 'from client A')).toBe(true);

    await world.settle();
    expect(serviceB.list.rows.some((todo) => todo.text === 'from client A')).toBe(true);
    expect(serviceA.list.rows.length).toBe(serviceB.list.rows.length);
    await world.close();
  });

  test('remaining derives and toggle round-trips', async () => {
    const world = await makeWorld();
    const client = await world.client('web_c');
    const service = new ServiceContext({ client }).get(TodoService);
    await client.subscribe(todosSync.todoList, {});

    const before = service.remaining();
    const first = service.list.rows[0];
    service.toggle(first.id);
    expect(service.remaining()).toBe(before - 1); // optimistic, instantly
    await world.settle();
    expect(service.remaining()).toBe(before - 1); // confirmed, still true
    expect(client.explain(todosSync.todos, first.id).cause?.kind).toBe('sync-apply');
    await world.close();
  });

  test('clear completed is one mutation and one undo/redo step', async () => {
    const world = await makeWorld();
    const [a, b] = await world.twoClients('web_clear_a', 'web_clear_b');
    const serviceA = new ServiceContext({ client: a }).get(TodoService);
    const serviceB = new ServiceContext({ client: b }).get(TodoService);
    await a.subscribe(todosSync.todoList, {});
    await b.subscribe(todosSync.todoList, {});

    const clearedIds = serviceA.list.rows.slice(0, 2).map((todo) => todo.id);
    for (const todoId of clearedIds) {
      serviceA.toggle(todoId);
    }
    await world.settle();

    serviceA.clearCompleted();
    expect(serviceA.list.rows.every((todo) => !clearedIds.includes(todo.id))).toBe(true);
    expect(a.mutationState(todosSync.deleteTodos).all).toHaveLength(1);
    await world.settle();
    expect(serviceB.list.rows.every((todo) => !clearedIds.includes(todo.id))).toBe(true);

    a.undo();
    await world.settle();
    expect(clearedIds.every((id) => serviceA.list.rows.some((todo) => todo.id === id))).toBe(true);
    expect(clearedIds.every((id) => serviceB.list.rows.some((todo) => todo.id === id))).toBe(true);

    a.redo();
    await world.settle();
    expect(serviceA.list.rows.every((todo) => !clearedIds.includes(todo.id))).toBe(true);
    await world.close();
  });
});
