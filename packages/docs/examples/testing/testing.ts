// #region world
import {
  World,
  expectMutationParity,
  expectQueryInvalidation,
  simulate
} from 'wheel/testing';

import * as todosServer from '../getting-started/todos.server';
import * as todosSync from '../getting-started/todos.sync';
import { TODOS_SCHEMA } from '../getting-started/todos.server';

export function makeWorld() {
  return World.create({
    syncModules: [todosSync],
    servers: [todosServer],
    setup: async (db) => {
      for (const statement of TODOS_SCHEMA) {
        await db.query(statement);
      }
    }
  });
}
// #endregion world

// #region convergence
export async function proveConvergence() {
  const world = await makeWorld();
  try {
    const [alice, bob] = await world.twoClients('web_alice', 'web_bob');
    await alice.subscribe(todosSync.todoList, {});
    const bobList = await bob.subscribe(todosSync.todoList, {});

    await alice.mutate(todosSync.addTodo, { text: 'hello' }).settled;
    await world.settle();

    if (!bobList.rows().some((todo) => todo.text === 'hello')) {
      throw new Error('clients did not converge');
    }
  } finally {
    await world.close();
  }
}
// #endregion convergence

// #region simulation
export async function runSimulation() {
  return simulate({
    syncModules: [todosSync],
    servers: [todosServer],
    setup: async (db) => {
      for (const statement of TODOS_SCHEMA) {
        await db.query(statement);
      }
    },
    seed: 42,
    steps: 500,
    clientCount: 3,
    tables: [todosSync.todos],
    prepare: async (client) => {
      await client.subscribe(todosSync.todoList, {});
    },
    ops: [
      {
        name: 'add',
        weight: 3,
        run: ({ rng, clients }) => {
          void rng.pick(clients).mutate(todosSync.addTodo, {
            text: `todo ${rng.int(1_000_000)}`
          });
        }
      }
    ]
  });
}
// #endregion simulation

// #region contracts
export async function verifyContracts() {
  const world = await makeWorld();
  try {
    const client = await world.client('web_contracts');
    const list = await client.subscribe(todosSync.todoList, {});

    await expectMutationParity({
      world,
      label: 'todos.add',
      mutate: () => {
        void client.mutate(todosSync.addTodo, { text: 'hello' });
      },
      read: () => list.rows().map((row) => row.id)
    });

    await expectQueryInvalidation({
      world,
      binding: todosServer.todoListServer,
      params: {}
    });
  } finally {
    await world.close();
  }
}
// #endregion contracts
