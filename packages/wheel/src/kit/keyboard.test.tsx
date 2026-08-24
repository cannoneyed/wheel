// @vitest-environment jsdom
/**
 * KeyboardService's contract: combo parsing (mod resolution, exact modifier
 * sets, case-insensitivity), headless dispatch with scope precedence
 * (innermost scope > outer scope > global), when() gating, the bindingsFor
 * probe, and — through a mounted <KeyboardSystem/> — the single document
 * listener plus editable-target skipping/opt-in.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'solid-js/web';

import { ServiceContext, ServiceProvider, connect } from '../core/index';
import {
  FocusService,
  KeyboardService,
  KeyboardSystem,
  matchesCombo,
  parseCombo
} from './index';

function keydown(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent('keydown', { cancelable: true, bubbles: true, ...init });
}

describe('parseCombo / matchesCombo', () => {
  it("resolves 'mod' per platform: cmd on mac, ctrl elsewhere", () => {
    expect(parseCombo('mod+k', true)).toEqual({ key: 'k', ctrl: false, meta: true, alt: false, shift: false });
    expect(parseCombo('mod+k', false)).toEqual({ key: 'k', ctrl: true, meta: false, alt: false, shift: false });
  });

  it('parses multi-modifier combos case-insensitively', () => {
    expect(parseCombo('Ctrl+Shift+P', false)).toEqual({ key: 'p', ctrl: true, meta: false, alt: false, shift: true });
    expect(parseCombo('ALT+ENTER', false)).toEqual({ key: 'enter', ctrl: false, meta: false, alt: true, shift: false });
  });

  it('rejects modifier-only combos', () => {
    expect(() => parseCombo('ctrl+shift', false)).toThrow(/no non-modifier key/);
  });

  it("parses 'space' as the literal space key (a raw ' ' would be trimmed away)", () => {
    expect(parseCombo('space', false)).toEqual({ key: ' ', ctrl: false, meta: false, alt: false, shift: false });
    expect(matchesCombo(keydown({ key: ' ' }), parseCombo('space', false))).toBe(true);
  });

  it('matches key case-insensitively and modifiers exactly', () => {
    const combo = parseCombo('ctrl+k', false);
    expect(matchesCombo(keydown({ key: 'K', ctrlKey: true }), combo)).toBe(true);
    expect(matchesCombo(keydown({ key: 'k', ctrlKey: true, shiftKey: true }), combo)).toBe(false);
    expect(matchesCombo(keydown({ key: 'k' }), combo)).toBe(false);
    expect(matchesCombo(keydown({ key: 'j', ctrlKey: true }), combo)).toBe(false);
  });
});

describe('KeyboardService (headless dispatch)', () => {
  function setup() {
    const context = new ServiceContext({ scopeId: 'kb' });
    const focusService = context.get(FocusService);
    const keyboardService = context.get(KeyboardService);
    return { context, focusService, keyboardService };
  }

  it('runs global bindings, preventDefaults, and unregisters cleanly', () => {
    const { context, keyboardService } = setup();
    try {
      const runs: string[] = [];
      const unregister = keyboardService.register({ id: 'global.d', key: 'ctrl+d', run: () => runs.push('global') });
      const event = keydown({ key: 'd', ctrlKey: true });
      expect(keyboardService.dispatch(event)).toBe(true);
      expect(runs).toEqual(['global']);
      expect(event.defaultPrevented).toBe(true);

      unregister();
      expect(keyboardService.dispatch(keydown({ key: 'd', ctrlKey: true }))).toBe(false);
      expect(runs).toEqual(['global']);
    } finally {
      context.dispose();
    }
  });

  it('rejects duplicate shortcut ids with both declaration sites', () => {
    const { context, keyboardService } = setup();
    try {
      keyboardService.register({ id: 'editor.save', key: 'mod+s', run: () => {} });
      expect(() =>
        keyboardService.register({ id: 'editor.save', key: 'mod+shift+s', run: () => {} })
      ).toThrow(/Duplicate shortcut id 'editor.save'.*First registered at.*duplicate registered at/);
    } finally {
      context.dispose();
    }
  });

  it('matches innermost scope first, then outer scopes, then global', () => {
    const { context, focusService, keyboardService } = setup();
    try {
      const outer = document.createElement('div');
      const inner = document.createElement('div');
      outer.appendChild(inner);
      document.body.appendChild(outer);
      focusService.registerScope('board', outer);
      focusService.registerScope('editor', inner);

      const runs: string[] = [];
      keyboardService.register({ id: 'global.d', key: 'ctrl+d', run: () => runs.push('global') });
      keyboardService.register({ id: 'board.d', key: 'ctrl+d', scope: 'board', run: () => runs.push('board') });
      keyboardService.register({ id: 'editor.d', key: 'ctrl+d', scope: 'editor', run: () => runs.push('editor') });

      focusService.noteFocusChange(inner);
      keyboardService.dispatch(keydown({ key: 'd', ctrlKey: true }));
      expect(runs).toEqual(['editor']);

      focusService.noteFocusChange(outer);
      keyboardService.dispatch(keydown({ key: 'd', ctrlKey: true }));
      expect(runs).toEqual(['editor', 'board']);

      focusService.noteFocusChange(null);
      keyboardService.dispatch(keydown({ key: 'd', ctrlKey: true }));
      expect(runs).toEqual(['editor', 'board', 'global']);
      outer.remove();
    } finally {
      context.dispose();
    }
  });

  it('when() gates a binding; a gated scoped binding falls through to global', () => {
    const { context, focusService, keyboardService } = setup();
    try {
      const scope = document.createElement('div');
      document.body.appendChild(scope);
      focusService.registerScope('board', scope);
      focusService.noteFocusChange(scope);

      let armed = false;
      const runs: string[] = [];
      keyboardService.register({ id: 'board.d', key: 'ctrl+d', scope: 'board', when: () => armed, run: () => runs.push('board') });
      keyboardService.register({ id: 'global.d', key: 'ctrl+d', run: () => runs.push('global') });

      keyboardService.dispatch(keydown({ key: 'd', ctrlKey: true }));
      expect(runs).toEqual(['global']);
      armed = true;
      keyboardService.dispatch(keydown({ key: 'd', ctrlKey: true }));
      expect(runs).toEqual(['global', 'board']);
      scope.remove();
    } finally {
      context.dispose();
    }
  });

  it('bindingsFor lists a scope’s eligible bindings (scope + global, when-filtered)', () => {
    const { context, keyboardService } = setup();
    try {
      keyboardService.register({ id: 'global.a', key: 'ctrl+a', run: () => {} });
      keyboardService.register({ id: 'board.b', key: 'ctrl+b', scope: 'board', run: () => {} });
      keyboardService.register({ id: 'editor.c', key: 'ctrl+c', scope: 'editor', run: () => {} });
      keyboardService.register({ id: 'board.e', key: 'ctrl+e', scope: 'board', when: () => false, run: () => {} });

      expect(keyboardService.bindingsFor('board').map((b) => b.key)).toEqual(['ctrl+a', 'ctrl+b']);
      expect(keyboardService.bindingsFor('editor').map((b) => b.key)).toEqual(['ctrl+a', 'ctrl+c']);
      expect(keyboardService.bindingsFor(null).map((b) => b.key)).toEqual(['ctrl+a']);
    } finally {
      context.dispose();
    }
  });

  it('gives overlays keyboard ownership unless a binding explicitly opts in', () => {
    const { context, focusService, keyboardService } = setup();
    const overlay = document.createElement('div');
    const button = document.createElement('button');
    overlay.appendChild(button);
    document.body.appendChild(overlay);
    try {
      const runs: string[] = [];
      keyboardService.register({ id: 'app.open', key: 'ctrl+k', run: () => runs.push('app') });
      keyboardService.register({
        id: 'overlay.toggle',
        key: 'ctrl+k',
        inOverlays: true,
        run: () => runs.push('overlay')
      });
      const leave = focusService.enterOverlay(overlay);
      expect(keyboardService.dispatch(keydown({ key: 'k', ctrlKey: true }))).toBe(true);
      expect(runs).toEqual(['overlay']);
      leave();
      expect(keyboardService.dispatch(keydown({ key: 'k', ctrlKey: true }))).toBe(true);
      expect(runs).toEqual(['overlay', 'app']);
    } finally {
      overlay.remove();
      context.dispose();
    }
  });
});

describe('<KeyboardSystem /> (document listener + editable targets)', () => {
  let keyboardService!: KeyboardService;
  const connectKeyboardProbe = connect('KeyboardProbe', (c) => {
    keyboardService = c.service(KeyboardService);
    return {};
  });
  function KeyboardProbe() {
    connectKeyboardProbe({});
    return null;
  }

  function mountSystem() {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const dispose = render(
      () => (
        <ServiceProvider scopeId="kb-dom">
          <KeyboardProbe />
          <KeyboardSystem />
          <input data-testid="field" />
        </ServiceProvider>
      ),
      host
    );
    return {
      host,
      cleanup: () => {
        dispose();
        host.remove();
      }
    };
  }

  it('feeds document keydown into dispatch; unmounting removes the listener', () => {
    const { cleanup } = mountSystem();
    const runs: string[] = [];
    keyboardService.register({ id: 'global.g', key: 'ctrl+g', run: () => runs.push('g') });
    try {
      document.dispatchEvent(keydown({ key: 'g', ctrlKey: true }));
      expect(runs).toEqual(['g']);
    } finally {
      cleanup();
    }
    document.dispatchEvent(keydown({ key: 'g', ctrlKey: true }));
    expect(runs).toEqual(['g']);
  });

  it('skips editable targets unless the binding opts in with inInputs', () => {
    const { host, cleanup } = mountSystem();
    try {
      const runs: string[] = [];
      keyboardService.register({ id: 'global.g', key: 'ctrl+g', run: () => runs.push('plain') });
      keyboardService.register({ id: 'global.h', key: 'ctrl+h', inInputs: true, run: () => runs.push('inInputs') });
      const field = host.querySelector('[data-testid=field]') as HTMLInputElement;

      field.dispatchEvent(keydown({ key: 'g', ctrlKey: true }));
      expect(runs).toEqual([]);

      field.dispatchEvent(keydown({ key: 'h', ctrlKey: true }));
      expect(runs).toEqual(['inInputs']);

      // Same combos from a non-editable target: both fire.
      document.dispatchEvent(keydown({ key: 'g', ctrlKey: true }));
      expect(runs).toEqual(['inInputs', 'plain']);
    } finally {
      cleanup();
    }
  });
});
