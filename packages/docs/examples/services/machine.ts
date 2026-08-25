import { Service } from 'wheel/core';
import { assign, setup } from 'xstate';

interface SeekContext {
  readonly requestId: number | null;
  readonly target: number | null;
  readonly position: number;
  readonly error: string | null;
}

type SeekEvent =
  | { readonly type: 'requested'; readonly requestId: number; readonly target: number }
  | { readonly type: 'resolved'; readonly requestId: number; readonly position: number }
  | { readonly type: 'failed'; readonly requestId: number; readonly message: string }
  | { readonly type: 'canceled' };

const seekMachine = setup({
  types: {
    context: {} as SeekContext,
    events: {} as SeekEvent
  },
  guards: {
    isCurrentRequest: ({ context, event }) =>
      (event.type === 'resolved' || event.type === 'failed') &&
      event.requestId === context.requestId
  },
  actions: {
    begin: assign(({ event }) =>
      event.type === 'requested'
        ? { requestId: event.requestId, target: event.target, error: null }
        : {}
    ),
    finish: assign(({ event }) =>
      event.type === 'resolved'
        ? {
            requestId: null,
            target: null,
            position: event.position
          }
        : {}
    ),
    fail: assign(({ event }) =>
      event.type === 'failed'
        ? { requestId: null, target: null, error: event.message }
        : {}
    ),
    cancel: assign({ requestId: null, target: null })
  }
}).createMachine({
  context: { requestId: null, target: null, position: 0, error: null },
  initial: 'idle',
  states: {
    idle: {
      on: { requested: { target: 'seeking', actions: 'begin' } }
    },
    seeking: {
      on: {
        requested: { actions: 'begin' },
        resolved: {
          guard: 'isCurrentRequest',
          target: 'ready',
          actions: 'finish'
        },
        failed: {
          guard: 'isCurrentRequest',
          target: 'error',
          actions: 'fail'
        },
        canceled: { target: 'idle', actions: 'cancel' }
      }
    },
    ready: {
      on: { requested: { target: 'seeking', actions: 'begin' } }
    },
    error: {
      on: { requested: { target: 'seeking', actions: 'begin' } }
    }
  }
});

export class PlaybackService extends Service {
         /** Identity that survives minification (see require-service-name). */
         static override serviceName = 'PlaybackService';

  private readonly nextRequestId = this.field(0);

  readonly seek = this.machine(seekMachine, {
    transitions: {
      request: (requestId: number, target: number) => ({
        type: 'requested',
        requestId,
        target
      }),
      resolve: (requestId: number, position: number) => ({
        type: 'resolved',
        requestId,
        position
      }),
      fail: (requestId: number, message: string) => ({
        type: 'failed',
        requestId,
        message
      }),
      cancel: () => ({ type: 'canceled' })
    }
  });

  readonly startSeek = this.action((target: number) => {
    const requestId = this.nextRequestId.get() + 1;
    this.nextRequestId.set(requestId);
    this.seek.transitions.request(requestId, target);
    return requestId;
  });
}

export interface MediaDriver {
  seekTo(position: number): Promise<number>;
}

export async function seek(
  playback: PlaybackService,
  media: MediaDriver,
  target: number
): Promise<void> {
  const requestId = playback.startSeek(target);
  try {
    playback.seek.transitions.resolve(requestId, await media.seekTo(target));
  } catch (error) {
    playback.seek.transitions.fail(requestId, String(error));
  }
}
