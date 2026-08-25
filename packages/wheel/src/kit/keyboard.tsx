/**
 * The keyboard system: shortcuts as auditable, scope-aware data.
 *
 * A binding is registered with `KeyboardService.register` ({ key: 'mod+k',
 * run, scope?, when?, inInputs? }) and stored in a reactive atom — so "what
 * fires here?" is a question the debug panel can answer (`bindingsFor`), not
 * archaeology across scattered event listeners. One `<KeyboardSystem/>` host
 * owns the single document keydown listener and feeds
 * `KeyboardService.dispatch`, which is headlessly testable: match order is
 * FocusService's active scope path innermost-first, then global bindings,
 * registration order within a scope; the first match wins and gets
 * `preventDefault()`.
 *
 * Editable targets (input/textarea/select/contenteditable) are skipped unless
 * a binding opts in with `inInputs: true` — typing must never trigger
 * single-letter shortcuts.
 */
// wheel-component-root: headless — KeyboardSystem renders no DOM, only a document listener
import { onCleanup, type JSX } from 'solid-js';

import { Service } from '../core/services';
import { connect } from '../core/connect';
import { view } from '../core/view';
import { captureDeclSite } from '../core/decl-site';
import { FocusService } from './focus';

/** A declarative shortcut registration. */
export interface KeyBinding {
  /** Stable unique registration id (for example `'editor.undo'`). */
  readonly id: string;
  /**
   * Combo like `'mod+k'` or `'ctrl+shift+p'` — modifiers (`mod`/`ctrl`/
   * `cmd`/`alt`/`shift`) plus one non-modifier key, case-insensitive.
   * `mod` means cmd on macOS and ctrl everywhere else.
   */
  readonly key: string;
  /** Runs on match, after `preventDefault()`. */
  readonly run: (event: KeyboardEvent) => void;
  /**
   * Human-readable label ("Open the peek pane"). Optional but strongly
   * encouraged: a shortcuts-help surface built from `bindingsFor` can only
   * document what registrations describe — an undescribed binding shows as
   * its raw combo.
   */
  readonly description?: string;
  /**
   * Only fires while this FocusService scope is on the active path. Omit
   * for a global binding (fires regardless of focus scope, after scoped
   * candidates).
   */
  readonly scope?: string;
  /** Extra reactive gate — the binding is skipped while this returns false. */
  readonly when?: () => boolean;
  /**
   * Fire even when the event target is editable (input/textarea/select/
   * contenteditable). Default false: typing never triggers shortcuts.
   */
  readonly inInputs?: boolean;
  /**
   * Keep this global binding active while a Kit overlay owns focus. Default
   * false: overlay-local key handling wins. Use only for overlay controls
   * such as the command palette's own toggle.
   */
  readonly inOverlays?: boolean;
}

/** A parsed key combo: exact modifier set + lowercased `event.key`. */
export interface ParsedCombo {
  /** Lowercased non-modifier key (`'k'`, `'escape'`, `'arrowdown'`). */
  readonly key: string;
  /** Ctrl must be held. */
  readonly ctrl: boolean;
  /** Meta (cmd) must be held. */
  readonly meta: boolean;
  /** Alt (option) must be held. */
  readonly alt: boolean;
  /** Shift must be held. */
  readonly shift: boolean;
}

/** Whether this runtime is an Apple platform (decides what `mod` means). */
function isMacPlatform(): boolean {
  return typeof navigator !== 'undefined' && /mac|iphone|ipad|ipod/i.test(navigator.platform ?? '');
}

/**
 * Parse a `'mod+k'`-style combo into an exact modifier set. `mod` resolves
 * to cmd on macOS and ctrl elsewhere (override `mac` for headless tests).
 * Throws on combos with no non-modifier key — a modifier-only "shortcut" is
 * always a registration bug.
 */
export function parseCombo(combo: string, mac: boolean = isMacPlatform()): ParsedCombo {
  let ctrl = false;
  let meta = false;
  let alt = false;
  let shift = false;
  let key = '';
  for (const raw of combo.split('+')) {
    const part = raw.trim().toLowerCase();
    switch (part) {
      case 'mod':
        if (mac) meta = true;
        else ctrl = true;
        break;
      case 'ctrl':
      case 'control':
        ctrl = true;
        break;
      case 'cmd':
      case 'meta':
        meta = true;
        break;
      case 'alt':
      case 'option':
        alt = true;
        break;
      case 'shift':
        shift = true;
        break;
      case 'space':
        // The word form — a literal ' ' would be trimmed away by the parser.
        key = ' ';
        break;
      default:
        key = part;
    }
  }
  if (!key) {
    throw new Error(`Key combo '${combo}' has no non-modifier key`);
  }
  return { key, ctrl, meta, alt, shift };
}

/**
 * Whether a keydown event matches a parsed combo — key compared
 * case-insensitively, modifiers exactly (`ctrl+k` does NOT match
 * `ctrl+shift+k`).
 */
export function matchesCombo(event: KeyboardEvent, combo: ParsedCombo): boolean {
  return (
    event.key?.toLowerCase() === combo.key &&
    event.ctrlKey === combo.ctrl &&
    event.metaKey === combo.meta &&
    event.altKey === combo.alt &&
    event.shiftKey === combo.shift
  );
}

/** Editable targets swallow shortcuts unless a binding opts in. */
function isEditableTarget(target: EventTarget | null): boolean {
  // dispatch() is headless-testable by contract: in a DOM-less runtime there
  // is no HTMLElement (and `instanceof undefined` throws), so nothing is
  // editable.
  if (typeof HTMLElement === 'undefined') return false;
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable === true;
}

interface RegisteredBinding {
  readonly binding: KeyBinding;
  readonly combo: ParsedCombo;
  readonly declaredAt: string;
}

/**
 * Owns the shortcut table and the matching logic. Bindings live in a
 * reactive atom (they ARE data — auditable via `bindingsFor`); dispatch is a
 * pure-ish action over that data, so scope precedence is testable without a
 * DOM listener in the loop.
 */
export class KeyboardService extends Service {
         /** Identity that survives minification (see require-service-name). */
         static override serviceName = 'KeyboardService';

  /** State-tree group: wheel-internal plumbing, collapsed by default. */
  static override group = 'framework';

  private readonly focusService = this.service(FocusService);
  private readonly bindings = this.atom<readonly RegisteredBinding[]>([], 'bindings');

  /**
   * Register a shortcut; returns the unregister function. Services pair it
   * with `addCleanup` in their constructors, components with `onCleanup`.
   */
  register(binding: KeyBinding): () => void {
    const declaredAt = captureDeclSite(/\/kit\/keyboard\.(?:tsx?|jsx?)/);
    const existing = this.bindings.get().find((entry) => entry.binding.id === binding.id);
    if (existing) {
      throw new Error(
        `Duplicate shortcut id '${binding.id}'. First registered at ${existing.declaredAt}; duplicate registered at ${declaredAt}.`
      );
    }
    const entry: RegisteredBinding = { binding, combo: parseCombo(binding.key), declaredAt };
    this.bindings.set([...this.bindings.get(), entry]);
    return () => {
      this.bindings.set(this.bindings.get().filter((existing) => existing !== entry));
    };
  }

  /**
   * EVERY registered binding, ungated — what a shortcuts-help surface lists
   * (`bindingsFor` answers "what fires HERE, NOW"; this answers "what
   * exists").
   */
  readonly registrations = this.computed(
    (): readonly KeyBinding[] => this.bindings.get().map((entry) => entry.binding),
    'registrations'
  );

  /**
   * The bindings eligible while `scope` is active (that scope's own bindings
   * plus globals), filtered by their `when()` gates — the headless probe the
   * debug panel reads. Pass null for "outside every scope" (globals only).
   */
  readonly bindingsFor = this.computedFor((scope: string | null) => {
    return this.bindings
      .get()
      .filter(
        ({ binding }) =>
          (binding.scope === undefined || binding.scope === scope) && (binding.when?.() ?? true)
      )
      .map(({ binding }) => binding);
  }, 'bindingsFor');

  /**
   * Match a keydown against the table and run the first hit: active scope
   * path innermost-first, then globals; registration order within a scope.
   * Editable targets skip bindings without `inInputs`. Returns whether a
   * binding ran (after `preventDefault()`).
   */
  readonly dispatch = this.action((event: KeyboardEvent): boolean => {
    const entries = this.bindings.get();
    const editable = isEditableTarget(event.target);
    const overlayOpen = this.focusService.hasOverlay();
    const scopeOrder: Array<string | undefined> = [...this.focusService.activeScopePath.get(), undefined];
    for (const scope of scopeOrder) {
      for (const entry of entries) {
        if (entry.binding.scope !== scope) continue;
        if (overlayOpen && !entry.binding.inOverlays) continue;
        if (editable && !entry.binding.inInputs) continue;
        if (!matchesCombo(event, entry.combo)) continue;
        if (entry.binding.when && !entry.binding.when()) continue;
        event.preventDefault();
        entry.binding.run(event);
        return true;
      }
    }
    return false;
  }, 'dispatch');
}

// wheel-component-states: headless — KeyboardSystem renders no visual states, only a document listener
const connectKeyboardSystem = connect('KeyboardSystem', (c) => {
  const keyboardService = c.service(KeyboardService);
  return view({}, { dispatch: keyboardService.dispatch });
}, { group: 'framework' });

/**
 * Mount once at the app root: the single document keydown listener feeding
 * `KeyboardService.dispatch`. Renders nothing.
 */
export function KeyboardSystem(): JSX.Element {
  const state = connectKeyboardSystem({});
  // listener boundary: one document-level keydown listener for the whole
  // app, removed when the host unmounts.
  const onKeyDown = (event: KeyboardEvent) => state.dispatch(event);
  document.addEventListener('keydown', onKeyDown);
  onCleanup(() => document.removeEventListener('keydown', onKeyDown));
  return null;
}
