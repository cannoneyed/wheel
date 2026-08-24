/* eslint-disable wheel/require-export-jsdoc, wheel/require-member-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { batch, untrack } from 'solid-js';
import { unwrap } from 'solid-js/store';
import { SolidStore } from '../../base-utils/store/SolidStore';
import { createSelector } from '../../base-utils/store/createSelector';
import { generateId } from '../../base-utils/generateId';
import { Timeout } from '../../base-utils/createTimeout';
import { componentRuntime } from '../../base-utils/runtime';
import { ownerDocument } from '../../base-utils/owner';
import { activeElement, contains, getTarget } from '../../floating-ui-solid';
import { matchesFocusVisible as isFocusVisible } from '../../floating-ui-solid';
import type {
  ToastManagerAddOptions,
  ToastManagerPromiseOptions,
  ToastManagerUpdateOptions,
  ToastObject,
} from '../useToastManager';
import { resolvePromiseOptions } from '../utils/resolvePromiseOptions';

type ToastInternalUpdateOptions<Data extends object> = Partial<Omit<ToastObject<Data>, 'id'>>;

type UpdateToastBehavior = {
  resetTimer?: boolean | undefined;
  markUpdated?: boolean | undefined;
};

type RemoveToastBehavior = {
  skipOnRemove?: boolean | undefined;
};

export type State = {
  toasts: ToastObject<any>[];
  toastMetadata: Map<string, ToastMetadata>;
  hovering: boolean;
  focused: boolean;
  timeout: number;
  limit: number;
  isWindowFocused: boolean;
  viewport: HTMLElement | null;
  prevFocusElement: HTMLElement | null;
};

type ToastMetadata = {
  value: ToastObject<any>;
  domIndex: number;
  visibleIndex: number;
  offsetY: number;
};

type InitialState = Omit<State, 'toastMetadata'>;

interface TimerInfo {
  timeout?: Timeout | undefined;
  start: number;
  delay: number;
  remaining: number;
  callback: () => void;
}

function createToastMetadata(toasts: readonly ToastObject<any>[]): Map<string, ToastMetadata> {
  const metadata = new Map<string, ToastMetadata>();
  let visibleIndex = 0;
  let offsetY = 0;

  toasts.forEach((toast, toastIndex) => {
    const isEnding = toast.transitionStatus === 'ending';
    metadata.set(toast.id, {
      value: toast,
      domIndex: toastIndex,
      visibleIndex: isEnding ? -1 : visibleIndex,
      offsetY,
    });

    offsetY += toast.height || 0;

    if (!isEnding) {
      visibleIndex += 1;
    }
  });

  return metadata;
}

const toastMetadataSelector = (state: State) => state.toastMetadata;

export const selectors = {
  toasts: createSelector((state: State) => state.toasts),
  isEmpty: createSelector((state: State) => state.toasts.length === 0),
  toast: createSelector((state: State, id: string) => toastMetadataSelector(state).get(id)?.value),
  toastIndex: createSelector(
    (state: State, id: string) => toastMetadataSelector(state).get(id)?.domIndex ?? -1,
  ),
  toastOffsetY: createSelector(
    (state: State, id: string) => toastMetadataSelector(state).get(id)?.offsetY ?? 0,
  ),
  toastVisibleIndex: createSelector(
    (state: State, id: string) => toastMetadataSelector(state).get(id)?.visibleIndex ?? -1,
  ),
  hovering: createSelector((state: State) => state.hovering),
  focused: createSelector((state: State) => state.focused),
  expanded: createSelector((state: State) => state.hovering || state.focused),
  expandedOrOutOfFocus: createSelector(
    (state: State) => state.hovering || state.focused || !state.isWindowFocused,
  ),
  prevFocusElement: createSelector((state: State) => state.prevFocusElement),
};

type Selectors = typeof selectors;

/**
 * Solid port of upstream's `ToastStore`.
 *
 * Deviation: upstream mutates the toasts array by rebuilding a brand-new object per toast on every
 * update (`{ ...prevToast, ...updates }`) and relies on React's `key={toast.id}` to preserve
 * component identity across that reference churn. Solid's `<For>` (no separate keying mechanism is
 * available in this repo — no `@solid-primitives/keyed` dependency, see the CONVENTIONS.md note on
 * this port) diffs by array *value* identity, so replacing the object reference on every update
 * would make it tear down and remount each toast's subtree whenever any field changes. Instead, this
 * store mutates each toast object *in place* via `solid-js/store`'s array path-setters
 * (`writeState('toasts', predicate, partialPatch)`), so a toast's identity is stable for its entire
 * lifetime (added once, mutated in place, removed once) — `<For>` then works correctly with no
 * custom key function, and consumers reading `toast.title`/`toast.type`/etc. get fine-grained
 * reactivity for free through the store proxy.
 */
export class ToastStore extends SolidStore<State, Record<string, never>, Selectors> {
  private timers = new Map<string, TimerInfo>();

  private areTimersPaused = false;

  constructor(initialState: InitialState) {
    super(
      {
        ...initialState,
        toastMetadata: createToastMetadata(initialState.toasts),
      },
      {},
      selectors,
    );
  }

  setFocused(focused: boolean) {
    this.set('focused', focused);
  }

  setHovering(hovering: boolean) {
    this.set('hovering', hovering);
  }

  setIsWindowFocused(isWindowFocused: boolean) {
    this.set('isWindowFocused', isWindowFocused);
  }

  setPrevFocusElement(prevFocusElement: HTMLElement | null) {
    this.set('prevFocusElement', prevFocusElement);
  }

  setViewport = (viewport: HTMLElement | null) => {
    this.set('viewport', viewport);
  };

  syncProviderProps = (props: Pick<State, 'timeout' | 'limit'>) => {
    untrack(() => {
      batch(() => {
        const limitChanged = this.state.limit !== props.limit;

        if (this.state.timeout === props.timeout && !limitChanged) {
          return;
        }

        this.update({ timeout: props.timeout, limit: props.limit });

        if (limitChanged) {
          this.applyLimited(props.limit);
          this.syncMetadata();
        }
      });
    });
  };

  dispose = () => {
    this.timers.forEach((timer) => {
      timer.timeout?.clear();
    });
    this.timers.clear();
  };

  removeToast = (toastId: string, behavior: RemoveToastBehavior = {}) => {
    untrack(() => {
      const toast = this.state.toastMetadata.get(toastId)?.value;
      if (!toast) {
        return;
      }

      if (!behavior.skipOnRemove) {
        toast.onRemove?.();
      }

      // `batch()` ensures `toasts` and `toastMetadata` land as a single atomic reactive update — see
      // the class-level deviation note. Without it, a descendant reading `toastMetadata` between the
      // two writes (e.g. a `<For>` reconciliation triggered by the first write, before the second
      // completes) would observe a `toasts`/`toastMetadata` pair momentarily out of sync.
      batch(() => {
        this.writeState('toasts', (toasts) => toasts.filter((item) => item.id !== toastId));
        this.syncMetadata();

        if (this.state.toasts.length === 0) {
          this.update({ hovering: false, focused: false });
        }
      });
    });
  };

  addToast = <Data extends object>(toast: ToastManagerAddOptions<Data>): string => {
    return untrack(() => {
      const { timeout, limit } = this.state;
      const id = toast.id || generateId('toast');

      if (toast.id) {
        const existingToast = this.state.toastMetadata.get(toast.id)?.value;

        if (existingToast) {
          if (existingToast.transitionStatus === 'ending') {
            this.removeToast(toast.id, { skipOnRemove: true });
          } else {
            const { id: ignoredId, transitionStatus: ignoredTransitionStatus, ...updates } = toast;
            this.updateToastInternal(toast.id, updates, {
              resetTimer: true,
              markUpdated: true,
            });
            return toast.id;
          }
        }
      }

      const toastToAdd: ToastObject<Data> = {
        ...toast,
        id,
        updateKey: 0,
        transitionStatus: 'starting',
      };

      // `batch()` ensures `toasts`/`toastMetadata` reach any descendant as one atomic update — see
      // the class-level deviation note. Without it, `<For>` reacts to the `toasts` write and mounts
      // the new item SYNCHRONOUSLY as soon as this callback returns (Solid flushes a `batch()`'s
      // queued effects the instant the callback exits) — including its `onMount`-triggered
      // `recalculateHeight()` → `updateToastInternal()` call. The timer must therefore already be
      // scheduled (`this.timers.has(id)` true) *before* the batch closes: `updateToastInternal` only
      // schedules a timer itself when none exists yet, so if `scheduleTimer` ran afterwards instead,
      // the newly-mounted toast's `onMount` would already have created one, and this call would then
      // create a *second*, orphaned `Timeout` for the same id that `this.timers.set` silently
      // discards from its own bookkeeping — but whose underlying real `setTimeout` is never cleared,
      // so it fires and dismisses the toast regardless of later `pauseTimers()` calls.
      batch(() => {
        this.writeState('toasts', (toasts) => [toastToAdd, ...toasts]);
        this.applyLimited(limit);
        this.syncMetadata();

        const duration = toastToAdd.timeout ?? timeout;
        if (toastToAdd.type !== 'loading' && duration > 0) {
          this.scheduleTimer(id, duration, () => this.closeToast(id));
        }

        if (selectors.expandedOrOutOfFocus(this.state)) {
          this.pauseTimers();
        }
      });

      return id;
    });
  };

  updateToast = <Data extends object>(id: string, updates: ToastManagerUpdateOptions<Data>) => {
    this.updateToastInternal(id, updates, { markUpdated: true });
  };

  updateToastInternal = <Data extends object>(
    id: string,
    updates: ToastInternalUpdateOptions<Data>,
    behavior: UpdateToastBehavior = {},
  ) => {
    untrack(() => {
      const { timeout } = this.state;
      const prevToast = this.state.toastMetadata.get(id)?.value;
      if (!prevToast) {
        return;
      }

      // Ignore updates for toasts that are already closing.
      // This prevents races where async updates (e.g. promise success/error)
      // can block a dismissal from completing.
      if (prevToast.transitionStatus === 'ending') {
        return;
      }

      const prevTimeoutValue = prevToast.timeout;
      const prevType = prevToast.type;
      const prevUpdateKey = prevToast.updateKey ?? 0;

      const patch: Record<string, any> = { ...updates };
      if (behavior.markUpdated) {
        patch.updateKey = prevUpdateKey + 1;
      }

      // See `addToast`'s `batch()` note: the timer scheduling/clearing below must happen *inside*
      // the same batch, before Solid flushes reactive effects (e.g. a descendant's `onMount`) that
      // could otherwise race this method's own timer bookkeeping for the same id.
      batch(() => {
        this.writeState('toasts', (item) => item.id === id, patch);
        this.syncMetadata();

        const nextToast = this.state.toastMetadata.get(id)?.value;
        if (!nextToast) {
          return;
        }

        const nextTimeout = nextToast.timeout ?? timeout;
        const prevTimeout = prevTimeoutValue ?? timeout;

        const timeoutUpdated = Object.hasOwn(updates, 'timeout');

        const shouldHaveTimer =
          nextToast.transitionStatus !== 'ending' && nextToast.type !== 'loading' && nextTimeout > 0;

        const hasTimer = this.timers.has(id);
        const timeoutChanged = prevTimeout !== nextTimeout;
        const wasLoading = prevType === 'loading';

        if (!shouldHaveTimer && hasTimer) {
          this.clearTimer(id);
          return;
        }

        // Schedule or reschedule timer if needed
        if (
          shouldHaveTimer &&
          (!hasTimer || timeoutChanged || timeoutUpdated || wasLoading || behavior.resetTimer)
        ) {
          this.clearTimer(id);

          this.scheduleTimer(id, nextTimeout, () => this.closeToast(id));

          if (selectors.expandedOrOutOfFocus(this.state)) {
            this.pauseTimers();
          }
        }
      });
    });
  };

  closeToast = (toastId?: string) => {
    untrack(() => {
      const closeAll = toastId === undefined;
      const { limit } = this.state;

      if (!closeAll && !this.state.toastMetadata.get(toastId)?.value) {
        return;
      }

      let toastsThatWillFireOnClose: ToastObject<any>[] = [];

      // `batch()` ensures `toasts`/`toastMetadata`/`hovering`/`focused` reach any descendant as one
      // atomic update — see `addToast`'s equivalent note. Otherwise a descendant reacting mid-update
      // (e.g. `createOpenChangeComplete`'s effect on the closing toast itself, which reads
      // `transitionStatus`) could observe it flipped to `'ending'` while `toastMetadata` still
      // reflects the prior state.
      batch(() => {
        if (closeAll) {
          toastsThatWillFireOnClose = this.state.toasts.filter(
            (item) => item.transitionStatus !== 'ending',
          );
          this.clearTimers();
          this.writeState('toasts', () => true, { transitionStatus: 'ending', height: 0 });
        } else {
          const toast = this.state.toastMetadata.get(toastId)?.value!;
          toastsThatWillFireOnClose = toast.transitionStatus !== 'ending' ? [toast] : [];
          this.clearTimer(toastId);
          this.writeState('toasts', (item) => item.id === toastId, {
            transitionStatus: 'ending',
            height: 0,
          });
        }

        this.applyLimited(limit);
        this.syncMetadata();

        const hasActiveToasts = this.state.toasts.some((item) => item.transitionStatus !== 'ending');
        if (!hasActiveToasts) {
          this.update({ hovering: false, focused: false });
        }
      });

      toastsThatWillFireOnClose.forEach((toast) => {
        toast.onClose?.();
      });

      this.handleFocusManagement(toastId);
    });
  };

  promiseToast = <Value, Data extends object>(
    promiseValue: Promise<Value>,
    options: ToastManagerPromiseOptions<Value, Data>,
  ): Promise<Value> => {
    // Create a loading toast (which does not auto-dismiss).
    const loadingOptions = resolvePromiseOptions(options.loading);
    const id = this.addToast({
      ...loadingOptions,
      type: 'loading',
    });

    const handledPromise = promiseValue
      .then((result: Value) => {
        const successOptions = resolvePromiseOptions(options.success, result);
        this.updateToast(id, {
          ...successOptions,
          type: 'success',
          timeout: successOptions.timeout,
        });

        return result;
      })
      .catch((error) => {
        const errorOptions = resolvePromiseOptions(options.error, error);
        this.updateToast(id, {
          ...errorOptions,
          type: 'error',
          timeout: errorOptions.timeout,
        });

        // Deviation: upstream `return`s `Promise.reject(error)` here. Re-throwing instead produces
        // an identically-rejected `handledPromise` for every caller, but avoids constructing a
        // separate intermediate `Promise.reject(...)` object for this handler's return value to
        // "adopt" — a classic V8/Node false-positive trigger for `unhandledRejection` (the adopted
        // promise's rejection can be observed before the adoption link is wired up, even though the
        // logical chain is fully handled downstream by the caller's own `.catch()`).
        throw error;
      });

    // Private API used exclusively by `ToastProvider`'s toastManager subscription to hand off the
    // fully-chained promise back to `createToastManager`'s `promise()` return value — otherwise a
    // caller using the external manager (`Toast.createToastManager()`) instead of `useToastManager()`
    // would get back the raw, unmanaged `promiseValue` instead of the store's own success/error chain.
    if (Object.hasOwn(options, 'setPromise')) {
      (options as unknown as { setPromise: (promise: Promise<Value>) => void }).setPromise(
        handledPromise,
      );
    }

    return handledPromise;
  };

  pauseTimers = () => {
    if (this.areTimersPaused) {
      return;
    }
    this.areTimersPaused = true;
    this.timers.forEach((timer) => {
      if (timer.timeout) {
        timer.timeout.clear();
        const elapsed = componentRuntime.now() - timer.start;
        const remaining = timer.delay - elapsed;
        timer.remaining = remaining > 0 ? remaining : 0;
      }
    });
  };

  resumeTimers = () => {
    if (!this.areTimersPaused) {
      return;
    }
    this.areTimersPaused = false;
    this.timers.forEach((timer, id) => {
      timer.remaining = timer.remaining > 0 ? timer.remaining : timer.delay;
      timer.timeout ??= Timeout.create();
      timer.timeout.start(timer.remaining, () => {
        this.handleTimerFired(id);
        timer.callback();
      });
      timer.start = componentRuntime.now();
    });
  };

  restoreFocusToPrevElement = () => {
    untrack(() => {
      this.state.prevFocusElement?.focus({ preventScroll: true });
    });
  };

  handleDocumentPointerDown = (event: PointerEvent) => {
    untrack(() => {
      if (event.pointerType !== 'touch') {
        return;
      }

      const target = getTarget(event) as Element | null;
      if (contains(this.state.viewport, target)) {
        return;
      }

      // This is explicit touch activity outside the viewport, so the paused
      // interaction state should end even if the window focus state is unchanged.
      this.resumeTimers();
      this.update({ hovering: false, focused: false });
    });
  };

  private applyLimited(limit: number) {
    let activeIndex = 0;
    const toasts = this.state.toasts;
    for (let i = 0; i < toasts.length; i += 1) {
      const toast = toasts[i];
      if (toast.transitionStatus === 'ending') {
        continue;
      }
      const limited = activeIndex >= limit;
      activeIndex += 1;
      if (toast.limited !== limited) {
        this.writeState('toasts', i, 'limited', limited);
      }
    }
  }

  private syncMetadata() {
    this.set('toastMetadata', createToastMetadata(unwrap(this.state.toasts)));
  }

  private scheduleTimer(id: string, delay: number, callback: () => void) {
    const start = componentRuntime.now();
    const shouldStartActive = !selectors.expandedOrOutOfFocus(this.state);
    const currentTimeout = shouldStartActive ? Timeout.create() : undefined;

    currentTimeout?.start(delay, () => {
      this.handleTimerFired(id);
      callback();
    });

    this.timers.set(id, {
      timeout: currentTimeout,
      start: shouldStartActive ? start : 0,
      delay,
      remaining: delay,
      callback,
    });
  }

  private clearTimers() {
    this.timers.forEach((timer) => {
      timer.timeout?.clear();
    });
    this.timers.clear();
    this.areTimersPaused = false;
  }

  private clearTimer(id: string) {
    const timer = this.timers.get(id);
    timer?.timeout?.clear();
    this.timers.delete(id);

    this.resetPausedStateIfNoTimersRemain();
  }

  private handleTimerFired(id: string) {
    this.timers.delete(id);
    this.resetPausedStateIfNoTimersRemain();
  }

  private resetPausedStateIfNoTimersRemain() {
    if (this.timers.size === 0) {
      // No timers remain to keep paused; clear the flag so a fresh toast's
      // running timer can be paused again on hover/focus.
      this.areTimersPaused = false;
    }
  }

  private handleFocusManagement(toastId: string | undefined) {
    const activeEl = activeElement(ownerDocument(this.state.viewport));
    if (
      !this.state.viewport ||
      !contains(this.state.viewport, activeEl as HTMLElement | null) ||
      !isFocusVisible(activeEl)
    ) {
      return;
    }

    if (toastId === undefined) {
      this.restoreFocusToPrevElement();
      return;
    }

    const toasts = selectors.toasts(this.state);
    const currentIndex = selectors.toastIndex(this.state, toastId);
    let nextToast: ToastObject<any> | null = null;

    // Try to find the next toast that isn't animating out
    let index = currentIndex + 1;
    while (index < toasts.length) {
      if (toasts[index].transitionStatus !== 'ending') {
        nextToast = toasts[index];
        break;
      }
      index += 1;
    }

    // Go backwards if no next toast is found
    if (!nextToast) {
      index = currentIndex - 1;
      while (index >= 0) {
        if (toasts[index].transitionStatus !== 'ending') {
          nextToast = toasts[index];
          break;
        }
        index -= 1;
      }
    }

    if (nextToast) {
      nextToast.ref?.focus();
    } else {
      this.restoreFocusToPrevElement();
    }
  }
}
