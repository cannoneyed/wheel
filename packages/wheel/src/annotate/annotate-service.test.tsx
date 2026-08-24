// @vitest-environment jsdom
/**
 * The flow end to end: arm, pick a component, say something, save.
 *
 * What these tests actually protect is the PAYLOAD. A note is only worth
 * anything if what lands on disk carries the anchor, the component's live
 * state, and — for a clip — the named actions and state changes that happened
 * while it recorded. So the assertions are mostly "is the evidence in there".
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'solid-js/web';
import { useContext } from 'solid-js';

import { ServiceProvider, Service, connect, componentRoot, view } from '../core';
import { WheelContext, type WheelContextValue } from '../core/context';

import { AnnotateService } from './annotate-service';
import { WheelAnnotate } from './annotate-system';
import { setVideoCapture, setVoiceCapture } from './media';
import type { NotePayload } from './types';

class BoardService extends Service {
  readonly selection = this.atom<readonly string[]>([], 'selection');
  readonly toggleCell = this.action((cellId: string) => {
    this.selection.set([cellId]);
  }, 'toggleCell');
}

const connectCell = connect('BoardCell:3-7', (c) => {
  const board = c.service(BoardService);
  return view(
    { selected: () => board.selection.get().includes('3-7') },
    { toggle: () => board.toggleCell('3-7') }
  );
});

function BoardCell() {
  const state = connectCell({});
  return (
    <button use:componentRoot type="button" onClick={() => state.toggle()}>
      {state.selected ? 'on' : 'off'}
    </button>
  );
}

let teardown: (() => void) | null = null;
const posted: Array<Record<string, unknown>> = [];
const copied: string[] = [];

/** A fetch stub that answers the annotator's three endpoints. */
function stubFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/__wheel/notes')) {
        return new Response(JSON.stringify({ ok: true, notes: [] }), { status: 200 });
      }
      if (init?.method === 'POST') {
        posted.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        return new Response(
          JSON.stringify({ ok: true, dir: '/tmp/.wheel/notes/x', command: 'read .wheel/notes/x/note.md' }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ ok: true, dir: '/tmp/.wheel/notes' }), { status: 200 });
    })
  );
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: (text: string) => (copied.push(text), Promise.resolve()) }
  });
}

/** Mount an app with one connected component and return its wheel context. */
function mountApp(extra?: () => unknown): WheelContextValue {
  const host = document.createElement('div');
  document.body.appendChild(host);
  let context!: WheelContextValue;
  const Probe = () => {
    context = useContext(WheelContext)!;
    return null;
  };
  teardown = render(
    () => (
      <ServiceProvider>
        <Probe />
        <BoardCell />
        {extra?.() as never}
      </ServiceProvider>
    ),
    host
  );
  return context;
}

/** The annotate service, pre-attached to capture seams that need no hardware. */
function annotator(context: WheelContextValue): AnnotateService {
  const service = context.services.get(AnnotateService);
  service.attach(null, {
    region: () => Promise.resolve('data:image/png;base64,AAA'),
    stream: () => Promise.reject(new Error('no display capture in tests'))
  });
  return service;
}

afterEach(() => {
  teardown?.();
  teardown = null;
  posted.length = 0;
  copied.length = 0;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  setVoiceCapture(null);
  setVideoCapture(null);
});

describe('AnnotateService', () => {
  it('arms, picks a component, and holds its live state in the draft', () => {
    stubFetch();
    const context = mountApp();
    const service = annotator(context);

    service.arm();
    expect(service.mode.get()).toBe('armed');

    service.pickInstance('BoardCell:3-7');
    const draft = service.draft.get()!;
    expect(service.mode.get()).toBe('composing');
    expect(draft.anchor.instanceId).toBe('BoardCell:3-7');
    expect(draft.target?.state).toEqual({ selected: false });
    expect(draft.target?.actions).toEqual(['toggle']);
    service.disarm();
  });

  it('writes a payload carrying the note, the anchor and the state', async () => {
    stubFetch();
    const context = mountApp();
    const service = annotator(context);

    service.arm();
    service.pickInstance('BoardCell:3-7');
    service.setText('this cell never turns on');
    service.setLabel('bug');
    service.save();
    await vi.waitFor(() => expect(posted).toHaveLength(1));

    const body = posted[0]!;
    const payload = body['payload'] as NotePayload;
    expect(payload.text).toBe('this cell never turns on');
    expect(payload.label).toBe('bug');
    expect(payload.anchor.instanceId).toBe('BoardCell:3-7');
    expect(payload.target?.state).toEqual({ selected: false });
    expect(payload.id).toContain('this-cell-never-turns-on');
    expect(String(body['markdown'])).toContain('# this cell never turns on');
    service.disarm();
  });

  it('puts the read-this-file command on the clipboard', async () => {
    stubFetch();
    const context = mountApp();
    const service = annotator(context);

    service.arm();
    service.pickPage();
    service.setText('the whole screen is wrong');
    service.save();
    await vi.waitFor(() => expect(copied).toEqual(['read .wheel/notes/x/note.md']));
    expect(service.savedTo.get()).toBe('/tmp/.wheel/notes/x');
    service.disarm();
  });

  it('refuses to save an empty note', () => {
    stubFetch();
    const context = mountApp();
    const service = annotator(context);
    service.arm();
    service.pickPage();
    expect(service.hasContent()).toBe(false);
    service.setText('  ');
    expect(service.hasContent()).toBe(false);
    service.setText('something');
    expect(service.hasContent()).toBe(true);
    service.disarm();
  });

  it('records the actions and state changes that happen during a clip', () => {
    stubFetch();
    const context = mountApp();
    const service = annotator(context);
    const board = context.services.get(BoardService);

    service.arm();
    service.startClip();
    expect(service.recording.get()).toBe(true);
    board.toggleCell('3-7');
    service.stopClip();

    const draft = service.draft.get()!;
    expect(service.recording.get()).toBe(false);
    expect(draft.startedAt).not.toBeNull();
    expect(draft.timeline.map((event) => event.kind)).toEqual(['action', 'state']);
    expect(draft.timeline[0]).toMatchObject({ service: 'BoardService', action: 'toggleCell', args: ['3-7'] });
    expect(draft.startState?.['BoardService']).toMatchObject({ selection: ['3-7'] });
    service.disarm();
  });

  it('keeps the transcript as the readable half of a voice note', async () => {
    stubFetch();
    setVoiceCapture((options) => {
      options.onPartial?.('it drops the highlight');
      return {
        stop: () =>
          Promise.resolve({ transcript: 'it drops the highlight', audio: 'data:audio/webm;base64,AAA' }),
        cancel: () => undefined
      };
    });
    const context = mountApp();
    const service = annotator(context);

    service.arm();
    service.pickPage();
    service.listen();
    expect(service.draft.get()?.transcript).toBe('it drops the highlight');
    service.stopListening();
    await vi.waitFor(() => expect(service.draft.get()?.audio).toBe('data:audio/webm;base64,AAA'));

    service.save();
    await vi.waitFor(() => expect(posted).toHaveLength(1));
    const payload = posted[0]!['payload'] as NotePayload;
    expect(payload.voice).toEqual({
      transcript: 'it drops the highlight',
      hasAudio: true,
      source: 'speech-recognition'
    });
    expect(payload.attachments).toContain('audio.webm');
    service.disarm();
  });

  it('stops recording and drops the draft when annotation mode is left', () => {
    stubFetch();
    const context = mountApp();
    const service = annotator(context);
    service.arm();
    service.startClip();
    service.disarm();
    expect(service.mode.get()).toBe('off');
    expect(service.recording.get()).toBe(false);
    expect(service.draft.get()).toBeNull();
  });
});

describe('<WheelAnnotate/>', () => {
  it('shows a chip that arms the flow', () => {
    stubFetch();
    const context = mountApp(() => <WheelAnnotate />);
    const service = context.services.get(AnnotateService);

    const chip = document.querySelector<HTMLButtonElement>('[data-testid="wheel-annotate-chip"]')!;
    expect(chip).toBeTruthy();
    expect(document.querySelector('[data-testid="wheel-annotate-toolbar"]')).toBeNull();

    chip.click();
    expect(service.mode.get()).toBe('armed');
    expect(document.querySelector('[data-testid="wheel-annotate-toolbar"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="wheel-annotate-shield"]')).toBeTruthy();

    chip.click();
    expect(service.mode.get()).toBe('off');
  });

  it('opens the composer when a component is picked', () => {
    stubFetch();
    const context = mountApp(() => <WheelAnnotate />);
    const service = context.services.get(AnnotateService);
    service.arm();
    service.pickInstance('BoardCell:3-7');

    const composer = document.querySelector('[data-testid="wheel-annotate-composer"]');
    expect(composer?.textContent).toContain('BoardCell:3-7');
    service.disarm();
  });
});
