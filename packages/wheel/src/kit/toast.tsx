/**
 * Toasts: a global stack of transient status messages with a per-toast
 * lifecycle state machine so sync feedback never "flashes".
 *
 * The pacing contract (entering → active → (success) → leaving → gone):
 * - a toast is visible for at least MIN_VISIBLE_MS before it may resolve, so a
 *   20ms server confirm still reads as "Saving… ✓ Saved", not a flicker;
 * - resolved toasts linger for SUCCESS_HOLD_MS, then fade over LEAVE_MS;
 * - `flash` shows a self-dismissing message (the rejection-feedback path).
 *
 * Pacing runs on the owning ServiceContext's clock/scheduler seam, never raw
 * `setTimeout` / `Date.now`. Tests can replace both at the context boundary.
 * Timer handles live in a plain Map, never in an atom (no-handles-in-atoms).
 *
 * `<ToastSystem/>` (mount once) is the viewer over this data. It ships a
 * self-contained default look and takes an optional `renderToast` for full
 * headless control.
 */
import { For, type JSX } from 'solid-js';

import { Service } from '../core/services';
import { componentRoot, connect } from '../core/connect';
import { view } from '../core/view';

/** Toast visual flavor. */
export type ToastKind = 'progress' | 'success' | 'warn' | 'info';
/** Toast lifecycle state (drives the enter/leave transitions). */
export type ToastState = 'entering' | 'active' | 'leaving';

/** One toast on the stack. `id` is stable per concern (e.g. a mutation id). */
export interface Toast {
  /** Stable id — re-using it updates the toast in place rather than stacking. */
  readonly id: string;
  /** The message shown. */
  readonly text: string;
  /** Visual flavor. */
  readonly kind: ToastKind;
  /** Where the toast is in its enter/hold/leave lifecycle. */
  readonly state: ToastState;
  /** Injected-clock time (ms) when the toast first appeared; drives the min-visible floor. */
  readonly shownAt: number;
}

const ENTER_MS = 30;
const MIN_VISIBLE_MS = 500;
const SUCCESS_HOLD_MS = 900;
const LEAVE_MS = 250;
const FLASH_MS = 3200;

interface ToastTimer {
  cancel: () => void;
}

/** Owns the toast stack and each toast's lifecycle timers. */
export class ToastService extends Service {
         /** Identity that survives minification (see require-service-name). */
         static override serviceName = 'ToastService';

  /** State-tree group: wheel-internal plumbing, collapsed by default. */
  static override group = 'framework';

  /** The visible stack, oldest first. */
  readonly toasts = this.atom<readonly Toast[]>([], 'toasts');
  // Every lifecycle callback is owned by its toast id. Enter and flash timers
  // may coexist, but re-begin/dismiss cancels the whole prior generation.
  private readonly timers = new Map<string, Set<ToastTimer>>();

  /** Show (or update in place) a toast. Re-begins cancel any pending resolve. */
  readonly begin = this.action((id: string, text: string, kind: ToastKind = 'progress') => {
    this.clearTimers(id);
    const existing = this.toasts.get().find((toast) => toast.id === id);
    if (existing) {
      const state = existing.state === 'leaving' ? 'entering' : existing.state;
      this.patch(id, { text, kind, state, shownAt: this.now() });
      if (state === 'entering') {
        this.schedule(id, ENTER_MS, () => this.patch(id, { state: 'active' }));
      }
    } else {
      this.toasts.update((draft) => {
        draft.push({ id, text, kind, state: 'entering', shownAt: this.now() });
      });
      // entering → active on the next frame-ish tick so the transition can run.
      this.schedule(id, ENTER_MS, () => this.patch(id, { state: 'active' }));
    }
  }, 'begin');

  /** Show a self-dismissing toast that fades on its own after FLASH_MS. */
  readonly flash = this.action((id: string, text: string, kind: ToastKind = 'warn') => {
    this.begin(id, text, kind);
    this.schedule(id, FLASH_MS, () => this.dismiss(id));
  }, 'flash');

  /**
   * Resolve a toast to its success text — but never before MIN_VISIBLE_MS of
   * visibility, and always holding the success state before fading.
   */
  readonly succeed = this.action((id: string, text: string) => {
    const toast = this.toasts.get().find((entry) => entry.id === id);
    if (!toast) return;
    this.clearTimers(id);
    const wait = Math.max(0, toast.shownAt + MIN_VISIBLE_MS - this.now());
    this.schedule(id, wait, () => {
      this.patch(id, { text, kind: 'success', state: 'active' });
      this.schedule(id, SUCCESS_HOLD_MS, () => this.dismiss(id));
    });
  }, 'succeed');

  /** Fade a toast out and remove it. */
  readonly dismiss = this.action((id: string) => {
    if (!this.toasts.get().some((toast) => toast.id === id)) return;
    this.clearTimers(id);
    this.patch(id, { state: 'leaving' });
    this.schedule(id, LEAVE_MS, () => {
      this.toasts.update((draft) => {
        const index = draft.findIndex((toast) => toast.id === id);
        if (index >= 0) draft.splice(index, 1);
      });
    });
  }, 'dismiss');

  private patch(id: string, changes: Partial<Pick<Toast, 'text' | 'kind' | 'state' | 'shownAt'>>): void {
    this.toasts.update((draft) => {
      const toast = draft.find((entry) => entry.id === id);
      if (toast) Object.assign(toast, changes);
    });
  }

  private schedule(id: string, ms: number, run: () => void): void {
    const token: ToastTimer = { cancel: () => {} };
    let owned = this.timers.get(id);
    if (!owned) {
      owned = new Set();
      this.timers.set(id, owned);
    }
    owned.add(token);
    token.cancel = this.defer(ms, () => {
      this.removeTimer(id, token);
      run();
    });
  }

  private removeTimer(id: string, token: ToastTimer): void {
    const owned = this.timers.get(id);
    if (!owned) return;
    owned.delete(token);
    if (owned.size === 0) this.timers.delete(id);
  }

  private clearTimers(id: string): void {
    const owned = this.timers.get(id);
    if (!owned) return;
    this.timers.delete(id);
    for (const timer of owned) timer.cancel();
  }

  /** Clears every outstanding lifecycle timer when the context disposes. */
  protected override onDestroy(): void {
    for (const owned of this.timers.values()) {
      for (const timer of owned) timer.cancel();
    }
    this.timers.clear();
  }
}

const KIND_BORDER: Record<ToastKind, string> = {
  progress: 'var(--wheel-stage-line-strong, rgba(255,255,255,0.14))',
  success: 'var(--wheel-ok-soft, #10b981)',
  warn: 'var(--wheel-warn, #f59e0b)',
  info: 'var(--wheel-indigo-soft, #3b82f6)'
};

/**
 * Default per-toast card style: dark pill, kind-colored border, state-driven
 * fade. The pill is baked DARK on purpose (it must read the same over a light
 * or a dark app), so it takes the fixed `--wheel-stage-*` / status tokens
 * rather than the theme aliases. Every value falls back to the original
 * literal, so an app that never imports `wheel/styles` looks unchanged.
 */
function defaultToastStyle(toast: Toast): JSX.CSSProperties {
  const active = toast.state === 'active';
  return {
    'pointer-events': 'auto',
    cursor: 'pointer',
    'max-width': '360px',
    padding: '8px 14px',
    'border-radius': '8px',
    'font-size': '13px',
    'text-align': 'left',
    color: 'var(--wheel-stage-ink-strong, #fff)',
    background: 'var(--wheel-stage-4, #1a1d23)',
    border: `1px solid ${KIND_BORDER[toast.kind]}`,
    'box-shadow': 'var(--wheel-shadow-float, 0 8px 24px rgba(0,0,0,0.35))',
    opacity: active ? '1' : '0',
    transform: active ? 'translateY(0)' : 'translateY(8px)',
    transition: 'opacity 0.25s ease, transform 0.25s ease'
  };
}

/** ToastSystem's connection — exported for stubs and the states file. */
export const connectToastSystem = connect('ToastSystem', (c) => {
  const toastService = c.service(ToastService);
  return view({ toasts: toastService.toasts }, { dismiss: toastService.dismiss });
}, { group: 'framework' });

/**
 * The one toast host. Mount once inside the provider. Renders the stack
 * bottom-right; click a toast to dismiss it. Pass `renderToast` to replace the
 * default look entirely (the host still owns positioning and the click-to-
 * dismiss wrapper).
 */
export function ToastSystem(props: { renderToast?: (toast: Toast) => JSX.Element }): JSX.Element {
  const state = connectToastSystem(props);
  return (
    <div
      use:componentRoot
      data-testid="wheel-toast-stack"
      role="status"
      aria-live="polite"
      aria-atomic="false"
      aria-relevant="additions text"
      style={{
        position: 'fixed',
        right: '16px',
        bottom: '16px',
        'z-index': 12_000,
        display: 'flex',
        'flex-direction': 'column',
        'align-items': 'flex-end',
        gap: '8px',
        'pointer-events': 'none'
      }}
    >
      <For each={state.toasts}>
        {(toast) => (
          <div
            role="button"
            tabIndex={0}
            aria-label={`Dismiss: ${toast.text}`}
            data-toast-id={toast.id}
            data-kind={toast.kind}
            data-state={toast.state}
            style={props.renderToast ? { 'pointer-events': 'auto' } : defaultToastStyle(toast)}
            onClick={() => state.dismiss(toast.id)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              state.dismiss(toast.id);
            }}
          >
            {props.renderToast ? props.renderToast(toast) : toast.text}
          </div>
        )}
      </For>
    </div>
  );
}
