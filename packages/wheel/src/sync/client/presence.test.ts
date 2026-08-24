// @vitest-environment node
/**
 * The presence channel's client edges: coalesced publishing
 * (leading + trailing, latest-wins), immediate sends superseding pending
 * ones, reconnect republish, and typed declarations validating loudly on
 * send while SURFACING invalid peers on read (4.4: one typed calling
 * convention, failures visible, never silently dropped).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { presence, t } from '../index';
import { fixedClock, seededRandomBytes } from '../ids';
import type { ServerEvent } from '../protocol';
import { SyncClient } from './client';
import { MemoryCache } from './local-cache';
import type { SyncTransport } from './transport';

const editorPresence = presence({
  name: 'editor',
  state: t.object({
    blockId: t.string().nullable(),
    caretOffset: t.number().nullable()
  })
});

// A minimal counter shape for the coalescing tests — the sends assert on the
// exact payload, so the decl is just "one number field".
const counterPresence = presence({ name: 'counter', state: t.object({ n: t.number() }) });

// A single-field cursor for the reconnect-republish test.
const cursorPresence = presence({ name: 'cursor', state: t.object({ blockId: t.string() }) });
const loosePresence = presence({ name: 'loose', state: t.object({ value: t.unknown() }) });

function makeClient() {
  const sends: Array<Record<string, unknown> | null> = [];
  let pushEvent: (event: ServerEvent) => void = () => {};
  const transport: SyncTransport = {
    connect: async (_clientId, onEvent) => {
      pushEvent = onEvent;
    },
    subscribe: async () => ({ subscriptionId: 'sub_1', query: 'q', seq: 0, rows: [] }),
    unsubscribe: async () => {},
    mutate: async () => ({ ok: true, seq: 1 }),
    setPresence: async (_clientId, state) => {
      sends.push(state);
    },
    close: () => {}
  };
  const client = new SyncClient({
    transport,
    clientId: 'web_test',
    actor: 'user:test',
    clock: fixedClock(1_700_000_000_000, 1),
    randomBytes: seededRandomBytes(7),
    localCache: new MemoryCache()
  });
  return { client, sends, pushEvent: (event: ServerEvent) => pushEvent(event) };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('coalesced publishing', () => {
  it('a burst sends leading + trailing only, and the trailing send is the LATEST state', async () => {
    const { client, sends } = makeClient();
    for (let keystroke = 0; keystroke < 5; keystroke += 1) {
      client.setPresence(counterPresence, { n: keystroke }, { coalesceMs: 120 });
    }
    await vi.advanceTimersByTimeAsync(0);
    expect(sends).toEqual([{ n: 0 }]); // leading: instant, no added latency

    await vi.advanceTimersByTimeAsync(120);
    expect(sends).toEqual([{ n: 0 }, { n: 4 }]); // trailing: latest wins, intermediates dropped
  });

  it('sustained typing keeps a rolling window — one send per window, none lost at the end', async () => {
    const { client, sends } = makeClient();
    client.setPresence(counterPresence, { n: 0 }, { coalesceMs: 100 });
    await vi.advanceTimersByTimeAsync(50);
    client.setPresence(counterPresence, { n: 1 }, { coalesceMs: 100 });
    await vi.advanceTimersByTimeAsync(70); // t=120: window closed at 100 → sent n:1, window reopened
    client.setPresence(counterPresence, { n: 2 }, { coalesceMs: 100 });
    await vi.advanceTimersByTimeAsync(200);
    expect(sends).toEqual([{ n: 0 }, { n: 1 }, { n: 2 }]);
  });

  it('an immediate send supersedes any pending coalesced state', async () => {
    const { client, sends } = makeClient();
    client.setPresence(counterPresence, { n: 0 }, { coalesceMs: 120 });
    client.setPresence(counterPresence, { n: 1 }, { coalesceMs: 120 }); // pending
    client.setPresence(counterPresence, null); // blur: immediate, cancels the pending n:1
    await vi.advanceTimersByTimeAsync(500);
    expect(sends).toEqual([{ n: 0 }, null]);
  });
});

describe('reconnect republish', () => {
  it('rebootstrap republishes the last-published state so peers do not see a vanish', async () => {
    const { client, sends } = makeClient();
    await client.connect();
    client.setPresence(cursorPresence, { blockId: 'b1' });
    sends.length = 0;

    await client.rebootstrap();
    expect(sends).toEqual([{ blockId: 'b1' }]);
  });

  it('no presence was ever published → rebootstrap publishes nothing', async () => {
    const { client, sends } = makeClient();
    await client.connect();
    await client.rebootstrap();
    expect(sends).toEqual([]);
  });

  it('a new connection clears peer presence left behind by a deploy', async () => {
    const { client, pushEvent } = makeClient();
    await client.connect();
    pushEvent({
      type: 'presence',
      clientId: 'peer_old_connection',
      actor: 'user:peer',
      state: { blockId: 'before-deploy' }
    });

    pushEvent({ type: 'hello', clientId: 'web_test' });
    expect(client.peers(cursorPresence).valid.size).toBe(0);

    pushEvent({
      type: 'presence',
      clientId: 'peer_new_connection',
      actor: 'user:peer',
      state: { blockId: 'after-deploy' }
    });
    expect([...client.peers(cursorPresence).valid.entries()]).toEqual([
      ['peer_new_connection', { blockId: 'after-deploy' }]
    ]);
  });
});

describe('typed presence', () => {
  it('outgoing state is validated loudly at the call site', () => {
    const { client, sends } = makeClient();
    client.setPresence(editorPresence, { blockId: 'b1', caretOffset: 3 });
    expect(sends).toEqual([{ blockId: 'b1', caretOffset: 3 }]);

    expect(() =>
      client.setPresence(editorPresence, { blockId: 42 } as unknown as { blockId: string; caretOffset: number })
    ).toThrow(/presence "editor"/);
    expect(() => client.setPresence(loosePresence, { value: new Date(0) })).toThrow(
      /class instances are not data/
    );
  });

  it('peers(decl) validates each entry: valid ones typed, invalid ones SURFACED in failures', async () => {
    const { client, pushEvent } = makeClient();
    await client.connect();
    pushEvent({
      type: 'presence',
      clientId: 'peer_good',
      actor: 'user:good',
      state: { blockId: 'b1', caretOffset: 0 }
    });
    pushEvent({
      type: 'presence',
      clientId: 'peer_stale',
      actor: 'user:stale',
      state: { totally: 'different-schema' }
    });

    const peers = client.peers(editorPresence);
    // The good peer is typed and present.
    expect([...peers.valid.keys()]).toEqual(['peer_good']);
    expect(peers.valid.get('peer_good')).toEqual({ blockId: 'b1', caretOffset: 0 });
    expect(peers.actors.get('peer_good')).toBe('user:good');
    // The stale peer is NOT gone — it is surfaced as a failure the caller can see.
    expect([...peers.failures.keys()]).toEqual(['peer_stale']);
    const failure = peers.failures.get('peer_stale')!;
    expect(failure.clientId).toBe('peer_stale');
    expect(failure.actor).toBe('user:stale');
    expect(failure.state).toEqual({ totally: 'different-schema' });
    expect(failure.issues.length).toBeGreaterThan(0);
  });
});
