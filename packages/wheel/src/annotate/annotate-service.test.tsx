// @vitest-environment jsdom
/**
 * The flow end to end: arm, draw a box, say something, save.
 *
 * What these tests actually protect is the PAYLOAD. A note is only worth
 * anything if what is sent carries the rectangle, the live state of what was
 * under it, and the actions and state changes that led there. So the
 * assertions are mostly "is the evidence in there".
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
  /** Identity that survives minification (see require-service-name). */
  static override serviceName = 'BoardService';

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

/** Where the board cell sits, since jsdom lays nothing out. */
const CELL = { x: 0, y: 0, width: 100, height: 50 };

/** A rectangle drawn around the cell — the one way into the composer. */
const OVER_CELL = { x: 0, y: 0, width: 120, height: 60 };

function BoardCell() {
  const state = connectCell({});
  return (
    <button
      use:componentRoot
      type="button"
      ref={(element: HTMLButtonElement) => {
        element.getBoundingClientRect = () =>
          ({
            ...CELL,
            top: CELL.y,
            left: CELL.x,
            right: CELL.x + CELL.width,
            bottom: CELL.y + CELL.height,
            toJSON: () => ({})
          }) as DOMRect;
      }}
      onClick={() => state.toggle()}
    >
      {state.selected ? 'on' : 'off'}
    </button>
  );
}

let teardown: (() => void) | null = null;
/** When a fake sync write happened, stamped before `save()` opens its window. */
let writeAt = 0;
const posted: Array<Record<string, unknown>> = [];
const copied: string[] = [];
const downloaded: Array<{ filename: string; text: string }> = [];
const requested: string[] = [];

/** A fetch stub that answers the annotator's three endpoints. */
function stubFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method !== 'POST') {
        return new Response(JSON.stringify({ ok: true, notes: [] }), { status: 200 });
      }
      requested.push(url);
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
  requested.length = 0;
  setNoteDownload(null);
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  setVoiceCapture(null);
  setVideoCapture(null);
});

describe('AnnotateService', () => {
  it('arms, takes a drawn rectangle, and holds the live state under it', () => {
    stubFetch();
    const context = mountApp();
    const service = annotator(context);

    service.arm();
    expect(service.mode.get()).toBe('armed');

    service.pickRegion(OVER_CELL);
    const draft = service.draft.get()!;
    expect(service.mode.get()).toBe('composing');
    expect(draft.anchor.rect).toEqual(OVER_CELL);
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
    service.pickRegion(OVER_CELL);
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

  it('sends notes wherever the app points it', async () => {
    stubFetch();
    const context = mountApp();
    const service = context.services.get(AnnotateService);
    service.attach(
      null,
      {
        region: () => Promise.resolve('data:image/png;base64,AAA'),
        stream: () => Promise.reject(new Error('no display capture in tests'))
      },
      { url: 'https://notes.example.com/annotations', headers: { authorization: 'Bearer t' } }
    );

    service.arm();
    service.pickRegion(OVER_CELL);
    service.setText('somewhere else entirely');
    service.save();

    await vi.waitFor(() => expect(posted).toHaveLength(1));
    expect(requested[0]).toBe('https://notes.example.com/annotations');
    service.disarm();
  });

  it('copies back whatever the sink says the note is now called', async () => {
    // A hosted collector has no path to `read`; it answers with a location.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
        init?.method === 'POST'
          ? new Response(JSON.stringify({ ok: true, location: 'https://notes.example.com/n/7' }), {
              status: 200
            })
          : new Response(JSON.stringify({ ok: true, notes: [] }), { status: 200 })
      )
    );
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: (text: string) => (copied.push(text), Promise.resolve()) }
    });

    const context = mountApp();
    const service = context.services.get(AnnotateService);
    service.attach(
      null,
      {
        region: () => Promise.resolve('data:image/png;base64,AAA'),
        stream: () => Promise.reject(new Error('no display capture in tests'))
      },
      { url: 'https://notes.example.com/annotations' }
    );

    service.arm();
    service.pickRegion(OVER_CELL);
    service.setText('hosted');
    service.save();

    await vi.waitFor(() => expect(copied).toEqual(['https://notes.example.com/n/7']));
    expect(service.savedTo.get()).toBe('https://notes.example.com/n/7');
    service.disarm();
  });

  it('puts the read-this-file command on the clipboard', async () => {
    stubFetch();
    const context = mountApp();
    const service = annotator(context);

    service.arm();
    service.pickRegion(OVER_CELL);
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
    service.pickRegion(OVER_CELL);
    expect(service.hasContent()).toBe(false);
    service.setText('  ');
    expect(service.hasContent()).toBe(false);
    service.setText('something');
    expect(service.hasContent()).toBe(true);
    service.disarm();
  });

  it('stores the rectangle where it was drawn, and does not chase the scroll', () => {
    stubFetch();
    const context = mountApp();
    const service = annotator(context);
    // The page is scrolled. A note describes what was on screen at a moment,
    // so the scroll offset is not added back in and the rectangle is kept
    // exactly as the pointer reported it.
    Object.defineProperty(globalThis, 'scrollY', { configurable: true, value: 400 });
    Object.defineProperty(globalThis, 'scrollX', { configurable: true, value: 0 });

    service.arm();
    service.pickRegion({ x: 10, y: 30, width: 200, height: 80 });

    expect(service.draft.get()?.anchor.rect).toEqual({ x: 10, y: 30, width: 200, height: 80 });
    service.disarm();
  });

  it('never opens a capture prompt as a side effect of drawing a box', async () => {
    stubFetch();
    let prompted = 0;
    const context = mountApp();
    const service = context.services.get(AnnotateService);
    service.attach(null, {
      region: () => {
        prompted += 1;
        return Promise.resolve('data:image/png;base64,AAA');
      },
      stream: () => Promise.reject(new Error('no display capture in tests'))
    });

    service.arm();
    service.pickRegion({ x: 0, y: 0, width: 50, height: 50 });
    service.setText('no prompt for this');
    expect(prompted).toBe(0);

    // Only pressing the button reaches the capture seam.
    service.captureShot();
    await vi.waitFor(() => expect(prompted).toBe(1));
    service.disarm();
  });

  it('never asks for the screen until the screen is asked for', () => {
    stubFetch();
    let streams = 0;
    const context = mountApp();
    const service = context.services.get(AnnotateService);
    service.attach(null, {
      region: () => Promise.resolve('data:image/png;base64,AAA'),
      stream: () => {
        streams += 1;
        return Promise.reject(new Error('no display capture in tests'));
      }
    });

    service.arm();
    service.pickRegion(OVER_CELL);
    // Drawing a box must not cost a screen-capture modal. The note records
    // what the app did either way; video is the thing you opt into.
    expect(streams).toBe(0);
    expect(service.filming.get()).toBe(false);

    service.toggleVideo();
    expect(streams).toBe(1);
    service.disarm();
  });

  it('carries the actions and state changes that led to the note', async () => {
    stubFetch();
    const context = mountApp();
    const service = annotator(context);
    const board = context.services.get(BoardService);

    service.arm();
    // This happens BEFORE the box is drawn, which is the normal order: you
    // notice something and then complain about it. The rolling buffer has been
    // running since mount, so the note carries it anyway.
    board.toggleCell('3-7');
    service.pickRegion(OVER_CELL);
    service.setText('the cell does the wrong thing');
    service.save();

    await vi.waitFor(() => expect(posted).toHaveLength(1));
    const payload = posted[0]!['payload'] as NotePayload;
    expect(payload.timeline.map((event) => event.kind)).toEqual(['action', 'state']);
    expect(payload.timeline[0]).toMatchObject({
      service: 'BoardService',
      action: 'toggleCell',
      args: ['3-7']
    });
    expect(payload.startState['BoardService']).toMatchObject({ selection: ['3-7'] });
    expect(payload.endedAt).toBeGreaterThanOrEqual(payload.startedAt);
    service.disarm();
  });

  it('drops a timeline that explains nothing', async () => {
    // A page with no services — a docs page, a component catalog of display
    // fixtures. The buffer fills with raw input, which is noise dressed as
    // evidence: eighteen recorded keystrokes say nothing about the note.
    stubFetch();
    const context = mountApp();
    const service = annotator(context);

    service.arm();
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    service.pickRegion(OVER_CELL);
    service.setText('nothing here has state');
    service.save();

    await vi.waitFor(() => expect(posted).toHaveLength(1));
    const payload = posted[0]!['payload'] as NotePayload;
    expect(payload.timeline).toEqual([]);
    expect(payload.startState).toEqual({});
    service.disarm();
  });

  it('does not record the writing of the note as something the app did', async () => {
    stubFetch();
    const context = mountApp(() => <AnnotateChrome />);
    const service = context.services.get(AnnotateService);
    const board = context.services.get(BoardService);
    annotator(context);

    service.arm();
    board.toggleCell('3-7');
    service.pickRegion(OVER_CELL);

    // Typing into the composer is not application behaviour. Without this the
    // timeline was mostly the keystrokes that wrote the note itself.
    const textarea = document.querySelector('[data-testid="wheel-annotate-text"]')!;
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    service.setText('typed into the composer');
    service.save();

    await vi.waitFor(() => expect(posted).toHaveLength(1));
    const payload = posted[0]!['payload'] as NotePayload;
    expect(payload.timeline.some((event) => event.kind === 'input')).toBe(false);
    expect(payload.timeline.some((event) => event.kind === 'action')).toBe(true);
    service.disarm();
  });

  it('names the mutations behind a sync write, including an atomic group', async () => {
    // `optimistic` alone says a local write happened, which the reader already
    // knew from the row changing. The mutation NAMES are the useful half, and
    // an atomic group commits several under one cause.
    //
    // This is a regression guard for a rename that typechecked: 0.2 turned
    // `cause.mutation` into `cause.mutations`, and the `in` narrowing that
    // read it simply stopped matching — every write silently lost its names.
    stubFetch();
    const context = mountApp();
    const service = context.services.get(AnnotateService);
    service.attach(
      {
        // Stamped BEFORE save, not when `recentWrites` is called. The harvest
        // window ends at the moment `save()` starts, so a write stamped inside
        // the call lands a millisecond past the end and is correctly dropped.
        recentWrites: () => [
          {
            at: writeAt,
            collection: 'cells',
            rowId: '3-7',
            value: { on: true },
            cause: { kind: 'optimistic', mutationId: 'm1', mutations: ['toggleCell', 'bumpTotal'] }
          }
        ],
        connectionStatus: () => 'connected',
        pendingMutations: () => 0
      } as unknown as Parameters<AnnotateService['attach']>[0],
      {
        region: () => Promise.resolve('data:image/png;base64,AAA'),
        stream: () => Promise.reject(new Error('no display capture in tests'))
      }
    );

    service.arm();
    context.services.get(BoardService).toggleCell('3-7');
    service.pickRegion(OVER_CELL);
    service.setText('this row is wrong');
    writeAt = context.services.now();
    service.save();

    await vi.waitFor(() => expect(posted).toHaveLength(1));
    const payload = posted[0]!['payload'] as NotePayload;
    const write = payload.timeline.find((event) => event.kind === 'write');
    expect(write).toMatchObject({
      collection: 'cells',
      cause: 'optimistic:toggleCell+bumpTotal'
    });
    service.disarm();
  });

  it('keeps a timeline whose only evidence is a sync write', async () => {
    // The gate used to require an action or a state change, which threw away
    // the most valuable note there is: an edit the server rejected and rolled
    // back moves no local atom, so its whole story is two writes and a cause.
    stubFetch();
    const context = mountApp();
    const service = context.services.get(AnnotateService);
    service.attach(
      {
        recentWrites: () => [
          {
            at: writeAt,
            collection: 'items',
            rowId: 'item_exit',
            value: { note: 'Clear' },
            cause: { kind: 'rollback', mutationId: 'm1', mutations: ['item.setNote'] }
          }
        ],
        connectionStatus: () => 'connected',
        pendingMutations: () => 0
      } as unknown as Parameters<AnnotateService['attach']>[0],
      {
        region: () => Promise.resolve('data:image/png;base64,AAA'),
        stream: () => Promise.reject(new Error('no display capture in tests'))
      }
    );

    service.arm();
    service.pickRegion(OVER_CELL);
    service.setText('my edit vanished');
    writeAt = context.services.now();
    service.save();

    await vi.waitFor(() => expect(posted).toHaveLength(1));
    const payload = posted[0]!['payload'] as NotePayload;
    expect(payload.timeline.some((event) => event.kind === 'write')).toBe(true);
    expect(payload.timeline.find((event) => event.kind === 'write')).toMatchObject({
      cause: 'rollback:item.setNote'
    });
    service.disarm();
  });

  it('does not record its own save in the note it is saving', async () => {
    // The network tap wraps `fetch` for the whole page, so the POST that
    // delivers a note used to appear inside that note.
    stubFetch();
    const context = mountApp();
    const service = annotator(context);

    service.arm();
    context.services.get(BoardService).toggleCell('3-7');
    service.pickRegion(OVER_CELL);
    service.setText('nothing about this note is about the note');
    service.save();

    await vi.waitFor(() => expect(posted).toHaveLength(1));
    const payload = posted[0]!['payload'] as NotePayload;
    const network = payload.timeline.filter((event) => event.kind === 'network');
    expect(network.every((event) => !String(event.url).includes('/__wheel/note'))).toBe(true);
    service.disarm();
  });

  it('finishes a running screen recording before it sends the note', async () => {
    stubFetch();
    let stopped = 0;
    setVideoCapture(() => ({
      stop: () => {
        stopped += 1;
        return Promise.resolve('data:video/webm;base64,AAA');
      },
      cancel: () => undefined
    }));
    const context = mountApp();
    const service = annotator(context);

    service.arm();
    service.pickRegion(OVER_CELL);
    service.setText('watch what happens here');
    service.toggleVideo();
    await vi.waitFor(() => expect(service.filming.get()).toBe(true));

    // Saving while still recording must not drop the video on the floor —
    // leaving the switch on is the expected way to use it.
    service.save();
    await vi.waitFor(() => expect(posted).toHaveLength(1));
    expect(stopped).toBe(1);
    expect(posted[0]!['video']).toBe('data:video/webm;base64,AAA');
    expect((posted[0]!['payload'] as NotePayload).attachments).toContain('clip.webm');
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
    service.pickRegion(OVER_CELL);
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
    service.pickRegion(OVER_CELL);
    // Screen capture is never a side effect of opening the composer — it opens
    // a permission prompt, so it happens only when someone presses the button.
    expect(service.draft.get()?.shot).toBeNull();
    service.captureShot();
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
    service.pickRegion(OVER_CELL);
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

  it('stops recording and drops the draft when annotation mode is left', async () => {
    stubFetch();
    let cancelled = 0;
    setVideoCapture(() => ({
      stop: () => Promise.resolve('data:video/webm;base64,AAA'),
      cancel: () => {
        cancelled += 1;
      }
    }));
    const context = mountApp();
    const service = annotator(context);
    service.arm();
    service.pickRegion(OVER_CELL);
    service.toggleVideo();
    await vi.waitFor(() => expect(service.filming.get()).toBe(true));

    service.disarm();
    expect(service.mode.get()).toBe('off');
    expect(service.filming.get()).toBe(false);
    expect(service.draft.get()).toBeNull();
    // The draft it belonged to is gone, so the recording is dropped rather
    // than kept for a note that will never exist.
    expect(cancelled).toBe(1);
  });
});

describe('<WheelAnnotate/>', () => {
  it('arms itself when mounted, because only an arm mounts it', () => {
    stubFetch();
    const context = mountApp(() => <AnnotateChrome />);
    const service = context.services.get(AnnotateService);

    expect(service.mode.get()).toBe('armed');
    expect(document.querySelector('[data-testid="wheel-annotate-shield"]')).toBeTruthy();

    document.querySelector<HTMLButtonElement>('[data-testid="wheel-annotate-chip"]')!.click();
    expect(service.mode.get()).toBe('off');
  });

  it('takes the shield away once a box is drawn, so the app stays usable', () => {
    stubFetch();
    const context = mountApp(() => <AnnotateChrome />);
    const service = context.services.get(AnnotateService);

    service.arm();
    expect(document.querySelector('[data-testid="wheel-annotate-shield"]')).toBeTruthy();

    // The shield swallows every press. It has to go while the composer is
    // open, or a screen recording could never contain anything to look at.
    service.pickRegion(OVER_CELL);
    expect(document.querySelector('[data-testid="wheel-annotate-shield"]')).toBeNull();

    service.discard();
    service.disarm();
  });

  it('buffers from mount, so a note covers what happened before it was written', () => {
    stubFetch();
    const context = mountApp(() => <AnnotateChrome />);
    const service = context.services.get(AnnotateService);
    const board = context.services.get(BoardService);

    // The bug this locks down: with the buffer starting at arm time, a note
    // could only ever describe what happened after someone complained.
    board.toggleCell('3-7');
    service.arm();

    expect(
      service.timeline().some((event) => event.kind === 'action' && event.action === 'toggleCell')
    ).toBe(true);
    service.disarm();
  });

  it('opens the composer naming what was under the box', () => {
    stubFetch();
    const context = mountApp(() => <AnnotateChrome />);
    const service = context.services.get(AnnotateService);
    service.arm();
    service.pickRegion(OVER_CELL);

    const composer = document.querySelector('[data-testid="wheel-annotate-composer"]');
    expect(composer?.textContent).toContain('BoardCell:3-7');
    service.disarm();
  });

  it('says that the note was saved, after the composer that asked for it is gone', async () => {
    // The regression this locks down: the confirmation used to render INSIDE
    // the composer, and saving closes the composer. The note reached disk and
    // the page said nothing at all.
    stubFetch();
    const context = mountApp(() => <AnnotateChrome />);
    const service = context.services.get(AnnotateService);
    annotator(context);

    service.arm();
    service.pickRegion(OVER_CELL);
    service.setText('the snackbar should say this landed');
    service.save();
    await vi.waitFor(() => expect(posted).toHaveLength(1));

    expect(document.querySelector('[data-testid="wheel-annotate-composer"]')).toBeNull();
    const toast = await vi.waitFor(() => {
      const element = document.querySelector('[data-testid="wheel-annotate-toast"]');
      expect(element).toBeTruthy();
      return element!;
    });
    expect(toast.textContent).toContain('saved');

    // And clicking it takes it away, rather than waiting out the timer.
    (toast as HTMLElement).click();
    expect(document.querySelector('[data-testid="wheel-annotate-toast"]')).toBeNull();
    service.disarm();
  });

  it('takes the message away on its own, so the page does not keep old news', async () => {
    vi.useFakeTimers();
    try {
      stubFetch();
      const context = mountApp(() => <AnnotateChrome />);
      const service = context.services.get(AnnotateService);
      annotator(context);

      service.arm();
      service.pickRegion(OVER_CELL);
      service.setText('this one dismisses itself');
      service.save();
      await vi.waitFor(() => expect(service.notice.get()).toContain('saved'));

      // The dismissal goes through the context scheduler, not setTimeout, so a
      // test advances it on the controlled clock.
      await vi.advanceTimersByTimeAsync(5_000);
      expect(service.notice.get()).toBeNull();
      expect(document.querySelector('[data-testid="wheel-annotate-toast"]')).toBeNull();
      service.disarm();
    } finally {
      vi.useRealTimers();
    }
  });
});
