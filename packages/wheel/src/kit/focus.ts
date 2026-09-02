/**
 * The focus system: focus as SCOPES, not elements.
 *
 * Raw `document.activeElement` is the wrong altitude for app logic — features
 * care about *regions* ("is the board focused? the editor?"), and shortcut
 * dispatch (KeyboardService) needs a stable, auditable answer to "where is
 * the user working?". A scope is a named region declared at its element with
 * `use:focusScope={{ id: 'board' }}`; the directive's focusin/focusout
 * listeners keep the service's active-scope path current, so the answer is
 * plain reactive data — no polling, no global focus listener.
 *
 * Scopes nest: with `editor` inside `board`, focusing the editor makes the
 * path `['editor', 'board']` (innermost first) and `activeScope()` answer
 * `'editor'`. The service also owns the capture/restore ritual overlay
 * systems perform by hand today (remember `document.activeElement`, put focus
 * back on close) — see `capture()`/`restore()`.
 *
 * A scope may carry DATA — the record the region is working on
 * (`use:focusScope={{ id: 'editor', data: { documentId } }}`). `activeData()`
 * reads the innermost scope's payload, so a feature asks "what is focused?"
 * and gets the answer, not an element it has to interrogate. Data is read
 * through the binding accessor, so changing it never re-registers the scope.
 *
 * Overlays do not erase the answer. A dialog or a command palette takes real
 * focus, which would otherwise empty the path the moment it opens — and a
 * palette that forgets where you were working cannot offer the commands that
 * belong there. `workingScope()` and `workingData()` freeze at the values the
 * outermost overlay opened over, and follow live focus again when the last
 * overlay closes.
 */
import { createRenderEffect, onCleanup, useContext } from 'solid-js';

import { Service } from '../core/services';
import { WheelContext } from '../core/context';

/** What a `use:focusScope` site declares: the scope's identity, and its subject. */
export interface FocusScopeBinding {
  /**
   * Unique scope id (e.g. `'board'`, `'editor'`). Scopes may nest; the
   * innermost one containing the focused element is the active scope.
   */
  readonly id: string;
  /**
   * What this region is working on — the record a feature needs when it asks
   * what is focused. Read through the binding accessor, so it stays live
   * without re-registering the scope. Consumers narrow the type themselves.
   */
  readonly data?: unknown;
}

interface ScopeRegistration {
  readonly id: string;
  readonly element: HTMLElement;
  /** The scope's live payload, read on demand. */
  readonly data: () => unknown;
}

interface OverlayRegistration {
  readonly root: HTMLElement;
  readonly restoreTo: HTMLElement | null;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

/** Focusable descendants in DOM order. Hidden/disabled controls are omitted. */
function focusableElements(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    (element) =>
      element.getAttribute('aria-hidden') !== 'true' &&
      !element.hasAttribute('hidden') &&
      !element.closest('[hidden],[aria-hidden="true"]')
  );
}

/** DOM depth of an element — used to order nested scopes innermost-first. */
function domDepth(element: Element): number {
  let depth = 0;
  let current = element.parentElement;
  while (current) {
    depth += 1;
    current = current.parentElement;
  }
  return depth;
}

/**
 * Tracks which focus scopes contain the focused element and offers the
 * capture/restore ritual overlays need. Scope registration comes from the
 * `use:focusScope` directive (or `registerScope` directly in headless tests);
 * the active path is plain reactive data, inspectable in the debug panel.
 */
export class FocusService extends Service {
  /** Identity that survives minification (see require-service-name). */
  static override serviceName = 'FocusService';

  /** State-tree group: wheel-internal plumbing, collapsed by default. */
  static override group = 'framework';

  private readonly scopes = new Map<string, ScopeRegistration>();
  /**
   * Bumped whenever the scope table changes. The table itself is a plain Map
   * — this is what makes a data read re-run when a scope arrives or leaves.
   */
  private readonly scopeGeneration = this.atom(0, 'scopeGeneration');
  /** Every scope containing the focused element, innermost first. */
  readonly activeScopePath = this.atom<readonly string[]>([], 'activeScopePath');
  private readonly captureStack: Array<HTMLElement | null> = [];
  private readonly overlayStack: OverlayRegistration[] = [];
  /** The scope path the outermost open overlay opened over. */
  private readonly overlayEntryPath = this.atom<readonly string[]>([], 'overlayEntryPath');
  /** Number of active Kit overlays. KeyboardService uses this ownership gate. */
  readonly overlayDepth = this.atom(0, 'overlayDepth');
  /** Whether any Kit overlay currently owns keyboard focus. */
  readonly hasOverlay = this.computed(() => this.overlayDepth.get() > 0, 'hasOverlay');

  /** Innermost active scope id, or null when focus is outside every scope. */
  readonly activeScope = this.computed(() => this.activeScopePath.get()[0] ?? null, 'activeScope');

  /** The innermost active scope's payload, or null when there is none. */
  readonly activeData = this.computed(() => this.dataOf(this.activeScope()), 'activeData');

  /**
   * Where the user is WORKING: the live scope path, except while an overlay
   * owns focus — then it is the path the outermost overlay opened over. A
   * dialog or palette therefore keeps the answer its commands need.
   */
  readonly workingScopePath = this.computed(
    (): readonly string[] =>
      this.overlayDepth.get() > 0 ? this.overlayEntryPath.get() : this.activeScopePath.get(),
    'workingScopePath'
  );

  /** Innermost working scope id — `activeScope()` that an overlay cannot erase. */
  readonly workingScope = this.computed(() => this.workingScopePath()[0] ?? null, 'workingScope');

  /** The innermost working scope's payload, or null when there is none. */
  readonly workingData = this.computed(() => this.dataOf(this.workingScope()), 'workingData');

  /** One scope's payload by id, or null when it is unregistered or carries none. */
  readonly dataFor = this.computedFor((scopeId: string) => this.dataOf(scopeId), 'dataFor');

  /** Read a registered scope's payload. Re-runs when the scope table changes. */
  private dataOf(scopeId: string | null): unknown {
    this.scopeGeneration.get();
    if (!scopeId) return null;
    return this.scopes.get(scopeId)?.data() ?? null;
  }

  /**
   * Recompute the active-scope path for a new focus target. The directive's
   * focusin/focusout listeners feed this; idempotent, so overlapping bubbled
   * events from nested scopes converge on the same answer.
   */
  readonly noteFocusChange = this.action((target: EventTarget | null) => {
    const node = target instanceof Node ? target : null;
    const containing: Array<{ id: string; depth: number }> = [];
    if (node) {
      for (const scope of this.scopes.values()) {
        if (scope.element === node || scope.element.contains(node)) {
          containing.push({ id: scope.id, depth: domDepth(scope.element) });
        }
      }
    }
    containing.sort((a, b) => b.depth - a.depth);
    const next = containing.map((entry) => entry.id);
    const current = this.activeScopePath.get();
    if (next.length === current.length && next.every((id, index) => id === current[index])) return;
    this.activeScopePath.set(next);
  }, 'noteFocusChange');

  /**
   * Move focus to a scope's element (the directive gives it `tabindex="-1"`
   * so this always works). The path updates immediately — headless callers
   * don't depend on the environment firing focus events.
   */
  readonly focus = this.action((scopeId: string) => {
    const scope = this.scopes.get(scopeId);
    if (!scope) return;
    scope.element.focus();
    this.noteFocusChange(scope.element);
  }, 'focus');

  /**
   * Remember the currently focused element. Overlay systems call this when
   * opening; pairs with `restore()`. A stack, so nested overlays unwind in
   * order.
   */
  readonly capture = this.action(() => {
    const active = document.activeElement;
    this.captureStack.push(active instanceof HTMLElement ? active : null);
  }, 'capture');

  /**
   * Refocus the most recently captured element (no-op if none was captured
   * or it has left the document). Overlay systems call this when closing.
   */
  readonly restore = this.action(() => {
    const element = this.captureStack.pop();
    if (element && element.isConnected) {
      element.focus();
      this.noteFocusChange(element);
    }
  }, 'restore');

  /**
   * Put an overlay on the shared focus stack and move focus inside it.
   * The returned cleanup removes that exact entry and restores focus when it
   * was the top overlay. Nested overlays therefore unwind in LIFO order.
   */
  readonly enterOverlay = this.action(
    (root: HTMLElement, initialFocus?: HTMLElement | null): (() => void) => {
      const active = document.activeElement;
      const entry: OverlayRegistration = {
        root,
        restoreTo: active instanceof HTMLElement ? active : null
      };
      // The OUTERMOST overlay freezes the working scope. Focus is about to
      // move into the overlay, which would otherwise empty the path and take
      // the app's answer to "where is the user working?" with it.
      if (this.overlayStack.length === 0) {
        this.overlayEntryPath.set(this.activeScopePath.get());
      }
      this.overlayStack.push(entry);
      this.overlayDepth.set(this.overlayStack.length);
      if (!root.hasAttribute('tabindex')) root.tabIndex = -1;
      const target =
        initialFocus && (initialFocus === root || root.contains(initialFocus))
          ? initialFocus
          : focusableElements(root)[0] ?? root;
      target.focus();
      this.noteFocusChange(target);

      let left = false;
      return () => {
        if (left) return;
        left = true;
        const index = this.overlayStack.indexOf(entry);
        if (index < 0) return;
        const wasTop = index === this.overlayStack.length - 1;
        this.overlayStack.splice(index, 1);
        this.overlayDepth.set(this.overlayStack.length);
        if (!wasTop) return;

        const nextOverlay = this.overlayStack[this.overlayStack.length - 1];
        const restoreTarget =
          entry.restoreTo?.isConnected
            ? entry.restoreTo
            : nextOverlay
              ? focusableElements(nextOverlay.root)[0] ?? nextOverlay.root
              : null;
        restoreTarget?.focus();
        this.noteFocusChange(restoreTarget);
      };
    },
    'enterOverlay'
  );

  /**
   * Keep Tab/Shift+Tab inside the top overlay. Returns false when the event
   * does not belong to this root, so callers can leave unrelated keys alone.
   */
  readonly trapOverlayTab = this.action((root: HTMLElement, event: KeyboardEvent): boolean => {
    if (event.key !== 'Tab' || this.overlayStack.at(-1)?.root !== root) return false;
    const focusable = focusableElements(root);
    event.preventDefault();
    if (focusable.length === 0) {
      root.focus();
      this.noteFocusChange(root);
      return true;
    }
    const active = document.activeElement;
    const current = active instanceof HTMLElement ? focusable.indexOf(active) : -1;
    const next = event.shiftKey
      ? current <= 0
        ? focusable.length - 1
        : current - 1
      : current < 0 || current === focusable.length - 1
        ? 0
        : current + 1;
    focusable[next].focus();
    this.noteFocusChange(focusable[next]);
    return true;
  }, 'trapOverlayTab');

  /**
   * Register a scope element under an id; returns the unregister function.
   * The directive calls this — headless tests may too. Re-registering an id
   * replaces the previous element (last one wins). `data` is an accessor, so
   * the payload stays live without a second registration.
   */
  registerScope(id: string, element: HTMLElement, data: () => unknown = () => null): () => void {
    this.scopes.set(id, { id, element, data });
    this.scopeGeneration.set(this.scopeGeneration.get() + 1);
    return () => {
      if (this.scopes.get(id)?.element !== element) return;
      this.scopes.delete(id);
      this.scopeGeneration.set(this.scopeGeneration.get() + 1);
      if (this.activeScopePath.get().includes(id)) {
        this.activeScopePath.set(this.activeScopePath.get().filter((scopeId) => scopeId !== id));
      }
      // A scope that unmounts while an overlay is open must leave the frozen
      // path too, or the palette offers commands for a region that is gone.
      if (this.overlayEntryPath.get().includes(id)) {
        this.overlayEntryPath.set(this.overlayEntryPath.get().filter((scopeId) => scopeId !== id));
      }
    };
  }
}

/**
 * The `use:focusScope` directive — declare a focus scope on an existing
 * element, no wrapper, no ref plumbing:
 *
 *   <div use:focusScope={{ id: 'board' }}>…</div>
 *
 * The binding may carry `data` — what the region is working on:
 *
 *   <div use:focusScope={{ id: 'editor', data: { documentId: doc().id } }}>
 *
 * Registers the scope, keeps the service's active path current through
 * focusin/focusout, and makes the element programmatically focusable
 * (`tabindex="-1"`) so `FocusService.focus('board')` always lands. Only the
 * scope ID re-registers; a data change is read through the accessor, because
 * a re-registration would drop the scope out of the active path for a frame.
 */
export function focusScope(el: HTMLElement, value: () => FocusScopeBinding): void {
  const context = useContext(WheelContext);
  if (!context) {
    throw new Error('use:focusScope used outside a WheelProvider/ServiceProvider');
  }
  const service = context.services.get(FocusService);
  if (!el.hasAttribute('tabindex')) {
    el.tabIndex = -1;
  }
  const onFocusIn = (event: FocusEvent) => service.noteFocusChange(event.target);
  const onFocusOut = (event: FocusEvent) => service.noteFocusChange(event.relatedTarget);
  el.addEventListener('focusin', onFocusIn);
  el.addEventListener('focusout', onFocusOut);

  // listener boundary: the scope re-registers only when its ID changes. The
  // effect still re-runs on a data change (reading `.id` reads the binding),
  // and then does nothing — which is the point.
  let registeredId: string | null = null;
  let unregister: (() => void) | null = null;
  createRenderEffect(() => {
    const id = value().id;
    if (id === registeredId) {
      return;
    }
    unregister?.();
    registeredId = id;
    unregister = service.registerScope(id, el, () => value().data ?? null);
  });

  onCleanup(() => {
    el.removeEventListener('focusin', onFocusIn);
    el.removeEventListener('focusout', onFocusOut);
    unregister?.();
  });
}

declare module 'solid-js' {
  namespace JSX {
    interface Directives {
      focusScope: FocusScopeBinding;
    }
  }
}
