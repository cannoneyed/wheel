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
import { AnnotateChrome } from './annotate-system';
import { setNoteDownload } from './download';
import { setVideoCapture, setVoiceCapture } from './media';
import { stopAnnotateSession } from './session';
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
const downloaded: Array<{ filename: string; text: string }> = [];

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
  stopAnnotateSession();
  posted.length = 0;
  copied.length = 0;
  downloaded.length = 0;
  setNoteDownload(null);
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

  it('downloads one self-contained file when no dev server answers', async () => {
    // A deployed app: the endpoint is not there, so the POST fails and the
    // note has to reach the human some other way.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Not Found', { status: 404 })));
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: (text: string) => (copied.push(text), Promise.resolve()) }
    });
    setNoteDownload((filename, text) => downloaded.push({ filename, text }));

    const context = mountApp();
    const service = annotator(context);
    service.arm();
    service.pickInstance('BoardCell:3-7');
    service.setText('this cell never turns on');
    service.save();

    await vi.waitFor(() => expect(downloaded).toHaveLength(1));
    const file = downloaded[0]!;
    expect(file.filename).toMatch(/^\d+-this-cell-never-turns-on\.md$/);

    // One file has to carry everything a directory would have: the prose, the
    // component state, and the machine-readable payload.
    expect(file.text).toContain('# this cell never turns on');
    expect(file.text).toContain('## State at capture');
    expect(file.text).toContain('## Payload');
    expect(JSON.parse(file.text.split('```json').pop()!.split('```')[0]!).text).toBe(
      'this cell never turns on'
    );
    expect(copied[0]).toBe(`read ~/Downloads/${file.filename}`);
    service.disarm();
  });

  it('embeds the screenshot in a downloaded note but leaves media out', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Not Found', { status: 404 })));
    setNoteDownload((filename, text) => downloaded.push({ filename, text }));

    const context = mountApp();
    const service = annotator(context);
    service.arm();
    service.pickInstance('BoardCell:3-7');
    await vi.waitFor(() => expect(service.draft.get()?.shot).toBeTruthy());
    service.setText('look at this');
    service.save();

    await vi.waitFor(() => expect(downloaded).toHaveLength(1));
    expect(downloaded[0]!.text).toContain('![');
    expect(downloaded[0]!.text).toContain('data:image/png;base64,AAA');
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
  it('arms itself when mounted, because only an arm mounts it', () => {
    stubFetch();
    const context = mountApp(() => <AnnotateChrome />);
    const service = context.services.get(AnnotateService);

    expect(service.mode.get()).toBe('armed');
    expect(document.querySelector('[data-testid="wheel-annotate-toolbar"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="wheel-annotate-shield"]')).toBeTruthy();

    document.querySelector<HTMLButtonElement>('[data-testid="wheel-annotate-chip"]')!.click();
    expect(service.mode.get()).toBe('off');
  });

  it('steps the picker aside while a clip records, so the app stays usable', () => {
    stubFetch();
    const context = mountApp(() => <AnnotateChrome />);
    const service = context.services.get(AnnotateService);

    service.arm();
    expect(document.querySelector('[data-testid="wheel-annotate-shield"]')).toBeTruthy();

    // A clip is made by USING the app. The shield swallows every press, so it
    // has to go while recording — otherwise no clip could ever contain input.
    service.startClip();
    expect(document.querySelector('[data-testid="wheel-annotate-shield"]')).toBeNull();
    expect(document.querySelector('[data-testid="wheel-annotate-stop"]')).toBeTruthy();

    service.stopClip();
    service.disarm();
  });

  it('buffers from mount, so the last minute covers what happened before arming', () => {
    stubFetch();
    const context = mountApp(() => <AnnotateChrome />);
    const service = context.services.get(AnnotateService);
    const board = context.services.get(BoardService);

    // The bug this locks down: with the buffer starting at arm time, the
    // "save the last minute" door could only ever show an empty minute.
    board.toggleCell('3-7');
    service.arm();
    service.saveRetro();

    const timeline = service.draft.get()!.timeline;
    expect(timeline.some((event) => event.kind === 'action' && event.action === 'toggleCell')).toBe(true);
    service.disarm();
  });

  it('opens the composer when a component is picked', () => {
    stubFetch();
    const context = mountApp(() => <AnnotateChrome />);
    const service = context.services.get(AnnotateService);
    service.arm();
    service.pickInstance('BoardCell:3-7');

    const composer = document.querySelector('[data-testid="wheel-annotate-composer"]');
    expect(composer?.textContent).toContain('BoardCell:3-7');
    service.disarm();
  });
});
