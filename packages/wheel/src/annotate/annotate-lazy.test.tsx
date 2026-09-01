// @vitest-environment jsdom
/**
 * The production split: what a page pays before anyone annotates anything.
 *
 * Two promises are under test. The chrome must not load until someone asks
 * for it — that is the 8.7 KB that stays out of the main bundle. And the
 * rolling buffer must be running the whole time anyway, because the minute
 * worth keeping is always the one that already happened.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'solid-js/web';
import { useContext } from 'solid-js';

import { ServiceProvider, Service } from '../core';
import { WheelContext, type WheelContextValue } from '../core/context';

import { WheelAnnotate } from './annotate-lazy';
import { annotateRecorder, stopAnnotateSession } from './session';
import { debugPanes } from '../debug/panes';

class BoardService extends Service {
  /** Identity that survives minification (see require-service-name). */
  static override serviceName = 'BoardService';

  readonly selection = this.atom<readonly string[]>([], 'selection');
  readonly toggleCell = this.action((cellId: string) => {
    this.selection.set([cellId]);
  }, 'toggleCell');
}

let teardown: (() => void) | null = null;

function mountApp(enabled?: boolean): WheelContextValue {
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
        {enabled === undefined ? <WheelAnnotate /> : <WheelAnnotate enabled={enabled} />}
      </ServiceProvider>
    ),
    host
  );
  return context;
}

/**
 * The way in is the dock's annotate pane — there is no floating chip. The dock
 * cannot import the annotator, so the pane is REGISTERED; this reads the
 * registry directly rather than mounting a whole `WheelApp`.
 */
const pane = () => debugPanes().find((entry) => entry.id === 'annotate');

afterEach(() => {
  teardown?.();
  teardown = null;
  stopAnnotateSession();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('<WheelAnnotate/>', () => {
  it('offers a pane and starts recording, without loading any chrome', () => {
    mountApp();
    expect(pane()).toBeDefined();
    // The armed surfaces are the lazy half; none of them exist yet.
    expect(document.querySelector('[data-testid="wheel-annotate-shield"]')).toBeNull();
    expect(annotateRecorder()?.active()).toBe(true);
  });

  it('draws nothing over the app until someone arms it', () => {
    mountApp();
    // The chip used to float over every page that mounted this. Annotation is
    // an instrument, so it lives in the instrument dock and the product is
    // left alone until you ask for it.
    expect(document.body.textContent).toBe('');
  });

  it('records what happened before anyone armed', () => {
    const context = mountApp();
    context.services.get(BoardService).toggleCell('3-7');

    const timeline = annotateRecorder()!.timeline();
    expect(timeline.some((event) => event.kind === 'action' && event.action === 'toggleCell')).toBe(true);
  });

  it('loads the chrome only when the pane asks, and arms it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: true, notes: [] }), { status: 200 }))
    );
    const context = mountApp();
    const paneHost = document.createElement('div');
    document.body.appendChild(paneHost);
    render(() => pane()!.render(context.services) as never, paneHost);
    document.querySelector<HTMLButtonElement>('[data-testid="wheel-annotate-arm"]')!.click();

    await vi.waitFor(() => expect(document.querySelector('[data-testid="wheel-annotate-shield"]')).toBeTruthy());
    // Arming goes straight to the marquee — drawing a rectangle IS the
    // interaction, so there is no mode to select first.
    expect(document.querySelector('[data-testid="wheel-annotate-shield"]')).toBeTruthy();
  });

  it('does nothing at all when it is not enabled', () => {
    mountApp(false);
    expect(pane()).toBeUndefined();
    // No pane, no chord, and — the part that matters in production — no taps.
    expect(annotateRecorder()).toBeNull();
  });

  it('runs for a production page when the app says so', () => {
    mountApp(true);
    expect(pane()).toBeDefined();
    expect(annotateRecorder()?.active()).toBe(true);
  });

  it('takes its pane away with it', () => {
    mountApp();
    expect(pane()).toBeDefined();
    teardown?.();
    teardown = null;
    // A page that unmounts the annotator must not leave a pane whose button
    // reaches a component that no longer exists.
    expect(pane()).toBeUndefined();
  });
});
