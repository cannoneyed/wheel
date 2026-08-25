// @vitest-environment jsdom
/**
 * The production split: what a page pays before anyone annotates anything.
 *
 * Two promises are under test. The chrome must not load until someone asks
 * for it — that is the 8.1 KB that stays out of the main bundle. And the
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

const chip = () => document.querySelector<HTMLButtonElement>('[data-testid="wheel-annotate-chip"]');

afterEach(() => {
  teardown?.();
  teardown = null;
  stopAnnotateSession();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('<WheelAnnotate/>', () => {
  it('shows a chip and starts recording, without loading any chrome', () => {
    mountApp();
    expect(chip()).toBeTruthy();
    // The armed surfaces are the lazy half; none of them exist yet.
    expect(document.querySelector('[data-testid="wheel-annotate-toolbar"]')).toBeNull();
    expect(document.querySelector('[data-testid="wheel-annotate-shield"]')).toBeNull();
    expect(annotateRecorder()?.active()).toBe(true);
  });

  it('records what happened before anyone armed', () => {
    const context = mountApp();
    context.services.get(BoardService).toggleCell('3-7');

    const timeline = annotateRecorder()!.timeline();
    expect(timeline.some((event) => event.kind === 'action' && event.action === 'toggleCell')).toBe(true);
  });

  it('loads the chrome only when the chip is pressed, and arms it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: true, notes: [] }), { status: 200 }))
    );
    mountApp();
    chip()!.click();

    await vi.waitFor(() => expect(document.querySelector('[data-testid="wheel-annotate-toolbar"]')).toBeTruthy());
    expect(document.querySelector('[data-testid="wheel-annotate-shield"]')).toBeTruthy();
  });

  it('does nothing at all when it is not enabled', () => {
    mountApp(false);
    expect(chip()).toBeNull();
    // No chip, no chord, and — the part that matters in production — no taps.
    expect(annotateRecorder()).toBeNull();
  });

  it('runs for a production page when the app says so', () => {
    mountApp(true);
    expect(chip()).toBeTruthy();
    expect(annotateRecorder()?.active()).toBe(true);
  });
});
