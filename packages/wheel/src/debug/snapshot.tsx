/**
 * Rich screenshots: drag a marquee, get the pixels AND the component/state
 * tree under them.
 *
 * - `SnapshotService` owns the flow: `start()` raises the marquee overlay;
 *   the drag's rectangle is captured (pixels via the display-capture seam,
 *   context via the registry hit-test) and STAGED; the staged card offers
 *   copy-image (clipboard), save (POST `/__wheel/snapshot` → PNG +
 *   context.json on disk, where an agent reads them), and discard.
 * - Pixels come from `getDisplayMedia` with `preferCurrentTab` — the
 *   browser prompts ONCE per tab session (the permission is a live capture
 *   stream, not a persistable grant); the stream is cached and reused for
 *   every capture until it ends. Frames are cropped to the marquee rect on
 *   a canvas, scaled by the stream/viewport ratio.
 * - The overlay unmounts and TWO paint frames pass before the grab, so the
 *   marquee chrome is never in the shot.
 *
 * The capture function is a module seam (`setSnapshotCapture`) so tests and
 * non-getDisplayMedia environments inject their own frame source.
 */
// wheel-view-root: debug chrome — must not appear in the tree it renders
// wheel-untracked-show: debug chrome — excluded from the component tree it renders
// wheel-raw-signal: same reason — this chrome registers no instance, so a
// named signal would be recorded against whatever app component happens to
// be its nearest registered ancestor
import { For, Show, createEffect, createSignal, onCleanup, type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';

import { Service } from '../core/services';
import { logger } from '../core/logger';
import type { InstanceRecord } from '../core/debug-registry';

import type { SelectionRect } from './inspector';

/** One captured component in a snapshot's context (JSON-safe). */
export interface SnapshotComponent {
  readonly instanceId: string;
  readonly name: string;
  readonly kind: InstanceRecord['kind'];
  readonly parentId: string | null;
  readonly rect: { x: number; y: number; width: number; height: number } | null;
  readonly state: Record<string, unknown>;
  readonly actions: readonly string[];
}

/** The rich half of a snapshot: what was under the rectangle. */
export interface SnapshotContext {
  readonly rect: SelectionRect;
  readonly viewport: { width: number; height: number };
  readonly components: readonly SnapshotComponent[];
}

/** A staged capture awaiting copy / save / discard. */
export interface StagedSnapshot {
  readonly rect: SelectionRect;
  /** PNG data URL of the cropped frame. */
  readonly dataUrl: string;
  readonly context: SnapshotContext;
}

type CaptureFrame = (rect: SelectionRect) => Promise<string>;

let captureFrame: CaptureFrame = displayMediaCapture;

/** @internal Test/host seam: replace the pixel source (jsdom has no getDisplayMedia). */
export function setSnapshotCapture(fn: CaptureFrame | null): void {
  captureFrame = fn ?? displayMediaCapture;
}

/** The cached per-tab capture stream + its ready video element. */
let liveVideo: HTMLVideoElement | null = null;

async function tabVideo(): Promise<HTMLVideoElement> {
  if (liveVideo && !(liveVideo.srcObject as MediaStream).getVideoTracks()[0]?.readyState.includes('ended')) {
    return liveVideo;
  }
  const stream = await navigator.mediaDevices.getDisplayMedia({
    audio: false,
    // preferCurrentTab / selfBrowserSurface are chromium extensions: the
    // picker defaults to (or only offers) THIS tab — one approval per tab
    // session, then the cached stream serves every capture.
    video: true,
    ...({ preferCurrentTab: true, selfBrowserSurface: 'include' } as object)
  });
  const video = document.createElement('video');
  video.srcObject = stream;
  video.muted = true;
  await video.play();
  await new Promise<void>((resolveReady) => {
    if (video.videoWidth > 0) resolveReady();
    else video.addEventListener('loadeddata', () => resolveReady(), { once: true });
  });
  stream.getVideoTracks()[0]?.addEventListener('ended', () => {
    liveVideo = null;
  });
  liveVideo = video;
  return video;
}

/** Wait two paint frames so DOM changes (overlay teardown) reach the screen. */
function paintsFlushed(): Promise<void> {
  return new Promise((resolveFlushed) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolveFlushed()))
  );
}

async function displayMediaCapture(rect: SelectionRect): Promise<string> {
  const video = await tabVideo();
  await paintsFlushed();
  const scaleX = video.videoWidth / window.innerWidth;
  const scaleY = video.videoHeight / window.innerHeight;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(rect.width * scaleX));
  canvas.height = Math.max(1, Math.round(rect.height * scaleY));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2d canvas unavailable');
  context.drawImage(
    video,
    rect.left * scaleX,
    rect.top * scaleY,
    rect.width * scaleX,
    rect.height * scaleY,
    0,
    0,
    canvas.width,
    canvas.height
  );
  return canvas.toDataURL('image/png');
}

function rectsIntersect(a: SelectionRect, b: DOMRect): boolean {
  return a.left < b.right && a.left + a.width > b.left && a.top < b.bottom && a.top + a.height > b.top;
}

/** The snapshot flow: marquee → staged capture → copy / save / discard. */
export class SnapshotService extends Service {
  /** State-tree group: debug tooling — hidden from the panel it powers. */
  static override group = 'debug';

  /** off / selecting (marquee up) / capturing (grabbing pixels) / staged (card up). */
  readonly mode = this.atom<'off' | 'selecting' | 'capturing' | 'staged'>('off', 'mode');
  /** The staged capture, while mode is 'staged'. */
  readonly staged = this.atom<StagedSnapshot | null>(null, 'staged');
  /** Absolute directory of the last save, from the dev-server endpoint. */
  readonly savedTo = this.atom<string | null>(null, 'savedTo');
  /** True when the dev server answered the capability probe (save enabled). */
  readonly canSave = this.atom(false, 'canSave');

  /** Raise the marquee overlay; the next drag captures. Also probes the save endpoint. */
  readonly start = this.action(() => {
    this.mode.set('selecting');
    void fetch('/__wheel/snapshot', { method: 'GET' })
      .then((response) => this.canSave.set(response.ok))
      .catch(() => this.canSave.set(false));
  }, 'start');

  /** Leave the flow entirely; drops any staged capture. */
  readonly cancel = this.action(() => {
    this.mode.set('off');
    this.staged.set(null);
  }, 'cancel');

  /** Capture a picked rectangle: overlay down, paints flushed, frame grabbed, context hit-tested. */
  readonly capture = this.action((rect: SelectionRect) => {
    this.mode.set('capturing');
    void captureFrame(rect)
      .then((dataUrl) => {
        this.staged.set({ rect, dataUrl, context: this.buildContext(rect) });
        this.mode.set('staged');
      })
      .catch((error: unknown) => {
        logger.warn('wheel: snapshot capture failed', error);
        this.mode.set('off');
      });
  }, 'capture');

  /** Copy the staged image to the clipboard (the human paste path). */
  readonly copyImage = this.action(() => {
    const staged = this.staged.get();
    if (!staged) return;
    void (async () => {
      const blob = await (await fetch(staged.dataUrl)).blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    })().catch((error: unknown) => logger.warn('wheel: clipboard copy failed', error));
  }, 'copyImage');

  /** POST the staged capture to the dev server: shot.png + context.json on disk. */
  readonly save = this.action(() => {
    const staged = this.staged.get();
    if (!staged) return;
    const name = staged.context.components[0]?.name ?? 'snapshot';
    void fetch('/__wheel/snapshot', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, png: staged.dataUrl, context: staged.context })
    })
      .then(async (response) => {
        const body = (await response.json()) as { ok: boolean; dir?: string; error?: string };
        if (body.ok && body.dir) this.savedTo.set(body.dir);
        else logger.warn('wheel: snapshot save failed', body.error ?? response.status);
      })
      .catch((error: unknown) => logger.warn('wheel: snapshot save failed', error));
  }, 'save');

  private buildContext(rect: SelectionRect): SnapshotContext {
    const components: SnapshotComponent[] = [];
    for (const record of this.context.registry.instances()) {
      let hitRect: DOMRect | null = null;
      for (const element of record.elements) {
        if (element.isConnected && rectsIntersect(rect, element.getBoundingClientRect())) {
          hitRect = element.getBoundingClientRect();
          break;
        }
      }
      if (!hitRect) continue;
      components.push({
        instanceId: record.instanceId,
        name: record.name,
        kind: record.kind,
        parentId: record.parentId,
        rect: { x: hitRect.x, y: hitRect.y, width: hitRect.width, height: hitRect.height },
        state: record.state(),
        actions: record.actions
      });
    }
    return {
      rect,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      components
    };
  }
}

const overlayStyles = {
  overlay: {
    position: 'fixed',
    inset: '0',
    'z-index': 10_500,
    cursor: 'crosshair',
    // Raw rgba on purpose: this wash sits over the page being captured and
    // must stay see-through.
    // wheel-color: --wheel-scrim is modal-strength and would hide the thing the drag aims at
    background: 'rgba(15,18,24,0.12)'
  },
  band: {
    position: 'absolute',
    border: '1px dashed var(--wheel-ok-soft, #10b981)',
    // wheel-color: the marquee fill must stay translucent over the page being captured
    background: 'rgba(16,185,129,0.10)',
    'pointer-events': 'none'
  },
  hint: {
    position: 'fixed',
    top: '14px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'var(--wheel-stage-4, #1a1d23)',
    color: 'var(--wheel-stage-ink-strong, #e5e7eb)',
    'border-radius': '8px',
    padding: '6px 14px',
    'font-size': '12px',
    'font-family': 'ui-monospace, monospace'
  }
} satisfies Record<string, JSX.CSSProperties>;

/**
 * The marquee overlay. Mounted by WheelApp next to the other systems;
 * renders nothing while the flow is off/staged.
 */
export function SnapshotSystem(props: { service: SnapshotService }): JSX.Element {
  const [dragStart, setDragStart] = createSignal<{ x: number; y: number } | null>(null);
  const [dragNow, setDragNow] = createSignal<{ x: number; y: number } | null>(null);
  const band = (): SelectionRect | null => {
    const start = dragStart();
    const now = dragNow();
    if (!start || !now) return null;
    return {
      left: Math.min(start.x, now.x),
      top: Math.min(start.y, now.y),
      width: Math.abs(start.x - now.x),
      height: Math.abs(start.y - now.y)
    };
  };
  const finishDrag = (): void => {
    const rect = band();
    setDragStart(null);
    setDragNow(null);
    if (rect && rect.width >= 4 && rect.height >= 4) {
      props.service.capture(rect);
    } else {
      props.service.cancel();
    }
  };
  // listener boundary: Escape cancels while the marquee is up; bound at the
  // document while selecting, gated by mode inside the handler.
  createEffect(() => {
    if (props.service.mode.get() !== 'selecting') return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        props.service.cancel();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    onCleanup(() => document.removeEventListener('keydown', onKeyDown));
  });
  return (
    <Show when={props.service.mode.get() === 'selecting'}>
      <Portal>
        <div
          style={overlayStyles.overlay}
          data-testid="wheel-snapshot-overlay"
          onPointerDown={(event) => {
            setDragStart({ x: event.clientX, y: event.clientY });
            setDragNow({ x: event.clientX, y: event.clientY });
          }}
          onPointerMove={(event) => {
            if (dragStart()) setDragNow({ x: event.clientX, y: event.clientY });
          }}
          onPointerUp={finishDrag}
        >
          <Show when={band()}>
            {(rect) => (
              <div
                style={{
                  ...overlayStyles.band,
                  left: `${rect().left}px`,
                  top: `${rect().top}px`,
                  width: `${rect().width}px`,
                  height: `${rect().height}px`
                }}
              />
            )}
          </Show>
        </div>
        <div style={overlayStyles.hint}>drag a rectangle to capture it — Escape cancels</div>
      </Portal>
    </Show>
  );
}

const cardStyles = {
  card: {
    'margin-top': '6px',
    border: '1px solid var(--wheel-stage-line-heavy, #3a3b3e)',
    'border-radius': '8px',
    padding: '8px',
    display: 'flex',
    'flex-direction': 'column',
    gap: '6px'
  },
  preview: { 'max-width': '100%', 'border-radius': '4px', border: '1px solid var(--wheel-stage-line-strong, #2a2f3a)' },
  buttonRow: { display: 'flex', gap: '6px', 'flex-wrap': 'wrap' },
  button: {
    padding: '2px 8px',
    color: 'var(--wheel-stage-ink, #d7d3cc)',
    background: 'none',
    border: '1px solid var(--wheel-stage-line-heavy, #3a3b3e)',
    'border-radius': '6px',
    cursor: 'pointer',
    font: 'inherit'
  },
  dim: { color: 'var(--wheel-stage-ink-faint, #8b8b8b)', 'word-break': 'break-all' }
} satisfies Record<string, JSX.CSSProperties>;

/** The staged-capture card: preview, copy image, save to disk, discard. */
export function SnapshotCard(props: { service: SnapshotService }): JSX.Element {
  return (
    <Show when={props.service.staged.get()}>
      {(staged) => (
        <div style={cardStyles.card} data-testid="wheel-snapshot-card">
          <img style={cardStyles.preview} src={staged().dataUrl} alt="captured region" />
          <div style={cardStyles.dim}>
            {Math.round(staged().rect.width)}×{Math.round(staged().rect.height)} ·{' '}
            {staged().context.components.length} components
          </div>
          <div style={cardStyles.buttonRow}>
            <button type="button" style={cardStyles.button} onClick={() => props.service.copyImage()}>
              copy image
            </button>
            <button
              type="button"
              style={cardStyles.button}
              disabled={!props.service.canSave.get()}
              title={props.service.canSave.get() ? undefined : 'wheelDevTools() vite plugin not detected'}
              onClick={() => props.service.save()}
              data-testid="wheel-snapshot-save"
            >
              save rich snapshot
            </button>
            <button type="button" style={cardStyles.button} onClick={() => props.service.cancel()}>
              discard
            </button>
          </div>
          <Show when={props.service.savedTo.get()}>
            {(dir) => <div style={cardStyles.dim}>saved: {dir()}</div>}
          </Show>
          <For each={staged().context.components.slice(0, 8)}>
            {(component) => <div style={cardStyles.dim}>{component.instanceId}</div>}
          </For>
        </div>
      )}
    </Show>
  );
}
