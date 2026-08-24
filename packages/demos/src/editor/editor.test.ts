// @vitest-environment node
/**
 * The editor vertical against a real in-process engine: two-client edit
 * convergence, split/merge as single two-row mutations with MUTUAL inverts
 * (undo a split IS the matching merge — byte-exact restores), last-write-wins
 * same-block conflicts with baseVersion as the witness, sync-tied undo/redo,
 * deterministic moves, and the presence channel.
 */
import { describe, expect, test } from 'vitest';

import { ServiceContext } from 'wheel/core';
import { World } from 'wheel/testing';
import { EditorService } from './services/editor-service';
import * as editorSync from './sync/editor.sync';
import * as editorServer from './sync/editor.server';
import { EDITOR_SCHEMA } from './sync/editor.server';

async function makeWorld(): Promise<World> {
  return World.create({
    syncModules: [editorSync],
    servers: [editorServer],
    setup: async (db) => {
      for (const statement of [...EDITOR_SCHEMA.create, ...EDITOR_SCHEMA.seed]) {
        await db.query(statement);
      }
    }
  });
}

async function twoServices(world: World): Promise<[EditorService, EditorService]> {
  const [a, b] = await world.twoClients('web_a', 'web_b');
  const serviceA = new ServiceContext({ client: a }).get(EditorService);
  const serviceB = new ServiceContext({ client: b }).get(EditorService);
  await a.subscribe(editorSync.blockList, {});
  await b.subscribe(editorSync.blockList, {});
  // Settle so BOTH services' liveQuery views are live (handles set) before the
  // test reads through them — matches the tracker's primedSession convention.
  await world.settle();
  return [serviceA, serviceB];
}

const texts = (service: EditorService) => service.list.rows.map((block) => block.text);
const ids = (service: EditorService) => service.list.rows.map((block) => block.id);

describe('editor demo', () => {
  test('a text commit converges across two clients and bumps the version', async () => {
    const world = await makeWorld();
    const [serviceA, serviceB] = await twoServices(world);

    const first = serviceA.list.rows[0];
    serviceA.commit(first.id, { text: 'rewritten by A' });
    // Optimistic: A sees text AND version bump instantly; B doesn't yet.
    expect(serviceA.block(first.id)?.text).toBe('rewritten by A');
    expect(serviceA.block(first.id)?.version).toBe(first.version + 1);
    expect(serviceB.block(first.id)?.text).toBe(first.text);

    await world.settle();
    expect(serviceB.block(first.id)?.text).toBe('rewritten by A');
    expect(serviceB.block(first.id)?.version).toBe(first.version + 1);
    expect(texts(serviceA)).toEqual(texts(serviceB));
    await world.close();
  });

  test('an unchanged commit is a no-op — blur never pollutes the undo stack', async () => {
    const world = await makeWorld();
    const [serviceA] = await twoServices(world);

    const first = serviceA.list.rows[0];
    serviceA.commit(first.id, { text: first.text });
    expect(serviceA.canUndo()).toBe(false);
    expect(serviceA.block(first.id)?.version).toBe(first.version);
    await world.close();
  });

  test('kind change syncs and resets kind-specific fields', async () => {
    const world = await makeWorld();
    const [serviceA, serviceB] = await twoServices(world);

    // Seed block 5 is a todo with checked=false; turn it into a heading.
    const todo = serviceA.list.rows.find((block) => block.kind === 'todo')!;
    serviceA.setKind(todo.id, 'h2');
    expect(serviceA.block(todo.id)?.kind).toBe('h2');
    expect(serviceA.block(todo.id)?.checked).toBeNull();

    await world.settle();
    expect(serviceB.block(todo.id)?.kind).toBe('h2');
    expect(serviceB.block(todo.id)?.checked).toBeNull();

    // Undo restores todo-ness INCLUDING the checked flag — one undo step.
    serviceA.undo();
    await world.settle();
    expect(serviceB.block(todo.id)?.kind).toBe('todo');
    expect(serviceB.block(todo.id)?.checked).toBe(false);
    await world.close();
  });

  test('split: one mutation, two rows, converges — and undo IS the matching merge', async () => {
    const world = await makeWorld();
    const [serviceA, serviceB] = await twoServices(world);

    const first = serviceA.list.rows[0]; // h1 'The wheel editor'
    const before = serviceA.list.rows.length;
    const newId = serviceA.split(first.id, 'The wheel', ' editor', 'paragraph')!;

    // Optimistic: original truncated, new block right after, one list slot longer.
    expect(serviceA.block(first.id)?.text).toBe('The wheel');
    expect(serviceA.block(newId)?.text).toBe(' editor');
    expect(serviceA.block(newId)?.kind).toBe('paragraph');
    expect(ids(serviceA)[1]).toBe(newId);
    expect(serviceA.list.rows.length).toBe(before + 1);

    await world.settle();
    expect(ids(serviceB)).toEqual(ids(serviceA));
    expect(serviceB.block(newId)?.text).toBe(' editor');

    // ONE undo step reverses the whole gesture (D2: split inverts to merge).
    serviceA.undo();
    expect(serviceA.block(first.id)?.text).toBe('The wheel editor');
    expect(serviceA.block(newId)).toBeUndefined();
    expect(serviceA.list.rows.length).toBe(before);

    await world.settle();
    expect(serviceB.block(first.id)?.text).toBe('The wheel editor');
    expect(serviceB.list.rows.length).toBe(before);
    await world.close();
  });

  test('merge: one mutation absorbs and deletes — and undo restores the removed row byte-exactly', async () => {
    const world = await makeWorld();
    const [serviceA, serviceB] = await twoServices(world);

    // Seed blocks 3 and 4 are bullets; merge 4 into 3.
    const [, , third, fourth] = serviceA.list.rows;
    const removedSnapshot = { ...fourth };
    const before = serviceA.list.rows.length;
    const mergedText = `${third.text} ${fourth.text}`;
    serviceA.merge(third.id, mergedText, fourth.id);

    expect(serviceA.block(third.id)?.text).toBe(mergedText);
    expect(serviceA.block(fourth.id)).toBeUndefined();

    await world.settle();
    expect(serviceB.block(third.id)?.text).toBe(mergedText);
    expect(serviceB.list.rows.length).toBe(before - 1);

    // ONE undo step: the inverse split restores the removed row byte-exactly
    // — same id, kind, text, position, version.
    serviceA.undo();
    await world.settle();
    for (const service of [serviceA, serviceB]) {
      const restored = service.block(removedSnapshot.id);
      expect(restored).toEqual(removedSnapshot);
      expect(service.block(third.id)?.text).toBe(third.text);
      expect(ids(service)[3]).toBe(removedSnapshot.id);
    }
    await world.close();
  });

  test('split-then-merge round trip leaves the document as it started', async () => {
    const world = await makeWorld();
    const [serviceA, serviceB] = await twoServices(world);

    const original = serviceA.list.rows.map((block) => ({ id: block.id, kind: block.kind, text: block.text }));
    const first = serviceA.list.rows[0];
    const newId = serviceA.split(first.id, 'The wheel', ' editor', 'paragraph')!;
    await world.settle();
    serviceA.merge(first.id, 'The wheel editor', newId);
    await world.settle();

    for (const service of [serviceA, serviceB]) {
      expect(service.list.rows.map((block) => ({ id: block.id, kind: block.kind, text: block.text }))).toEqual(original);
    }
    await world.close();
  });

  test('same-block conflict: last write wins, versions converge, baseVersion records the gap', async () => {
    const world = await makeWorld();
    const [serviceA, serviceB] = await twoServices(world);

    const first = serviceA.list.rows[0];
    // Both clients edit from the SAME base version — a real concurrent edit.
    serviceA.commit(first.id, { text: 'A wrote this' }, first.version);
    serviceB.commit(first.id, { text: 'B wrote this' }, first.version);

    await world.settle();
    // Single-writer server: both applied in arrival order; the later write
    // wins the text, and BOTH bumps landed (version advanced twice).
    const finalA = serviceA.block(first.id)!;
    const finalB = serviceB.block(first.id)!;
    expect(finalA).toEqual(finalB);
    expect(['A wrote this', 'B wrote this']).toContain(finalA.text);
    expect(finalA.version).toBe(first.version + 2);
    // The loser can still undo to resurrect their text — undo is a mutation.
    await world.close();
  });

  test('add-then-undo removes the block on both clients', async () => {
    const world = await makeWorld();
    const [serviceA, serviceB] = await twoServices(world);

    const before = serviceA.list.rows.length;
    const second = serviceA.list.rows[1];
    const newId = serviceA.add(second.id, 'todo');
    expect(ids(serviceA)[2]).toBe(newId);
    expect(serviceA.block(newId)?.kind).toBe('todo');
    expect(serviceA.block(newId)?.checked).toBe(false);

    await world.settle();
    expect(ids(serviceB)).toEqual(ids(serviceA));

    serviceA.undo();
    expect(serviceA.list.rows.length).toBe(before);
    await world.settle();
    expect(serviceB.list.rows.length).toBe(before);
    expect(ids(serviceB)).not.toContain(newId);
    await world.close();
  });

  test('redo reapplies the undone edit everywhere', async () => {
    const world = await makeWorld();
    const [serviceA, serviceB] = await twoServices(world);

    const first = serviceA.list.rows[0];
    serviceA.commit(first.id, { text: 'rewritten by A' });
    await world.settle();
    serviceA.undo();
    await world.settle();
    expect(serviceA.canRedo()).toBe(true);

    serviceA.redo();
    expect(serviceA.block(first.id)?.text).toBe('rewritten by A');
    await world.settle();
    expect(serviceB.block(first.id)?.text).toBe('rewritten by A');
    expect(serviceA.canRedo()).toBe(false);
    await world.close();
  });

  test('move up/down keeps a deterministic order across clients', async () => {
    const world = await makeWorld();
    const [serviceA, serviceB] = await twoServices(world);

    const [id0, id1, id2, id3] = ids(serviceA);
    serviceA.moveUp(id2);
    expect(ids(serviceA).slice(0, 4)).toEqual([id0, id2, id1, id3]);

    await world.settle();
    expect(ids(serviceB)).toEqual(ids(serviceA));

    serviceB.moveDown(id2);
    await world.settle();
    expect(ids(serviceA).slice(0, 4)).toEqual([id0, id1, id2, id3]);
    expect(ids(serviceA)).toEqual(ids(serviceB));
    await world.close();
  });

  test('presence: peers see which block a client is editing, and blur clears it', async () => {
    const world = await makeWorld();
    const [serviceA, serviceB] = await twoServices(world);

    const first = serviceA.list.rows[0];
    serviceA.publishCursor(first.id, 0);
    await world.settle();
    expect(serviceB.peersOn(first.id).map((peer) => peer.clientId)).toEqual(['web_a']);
    expect(serviceA.peersOn(first.id)).toEqual([]);

    serviceA.publishCursor(null);
    await world.settle();
    expect(serviceB.peersOn(first.id)).toEqual([]);
    await world.close();
  });

  test('live typing (008 P3): peers receive caret + preview through the presence channel, and the cap strips oversized previews', async () => {
    const world = await makeWorld();
    const [serviceA, serviceB] = await twoServices(world);

    const first = serviceA.list.rows[0];
    // The leading edge of the coalescing window sends immediately — a single
    // publish is visible to peers after one settle, no timers involved.
    serviceA.publishCursor(first.id, 5, 2, 'The wh|eel editor — live!');
    await world.settle();
    const [peer] = serviceB.peersOn(first.id);
    expect(peer.clientId).toBe('web_a');
    expect(peer.caretOffset).toBe(5);
    expect(peer.anchorOffset).toBe(2);
    expect(peer.previewText).toBe('The wh|eel editor — live!');
    // Preview is ephemeral display state: the committed row is untouched.
    expect(serviceB.block(first.id)?.text).toBe(first.text);

    // P4 guardrail: an oversized preview publishes caret-only.
    serviceA.publishCursor(null); // reset the coalescing window
    await world.settle();
    serviceA.publishCursor(first.id, 2, null, 'x'.repeat(5000));
    await world.settle();
    const [capped] = serviceB.peersOn(first.id);
    expect(capped.caretOffset).toBe(2);
    expect(capped.previewText).toBeNull();
    await world.close();
  });
});
