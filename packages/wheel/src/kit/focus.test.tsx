// @vitest-environment jsdom
/**
 * FocusService's contract: scope registration and innermost-first path
 * tracking (headless via registerScope/noteFocusChange, DOM via the
 * use:focusScope directive), programmatic focus(), capture/restore, and
 * unregistration cleaning the active path.
 */
import { describe, expect, it } from 'vitest';
import { Show, createSignal } from 'solid-js';
import { render } from 'solid-js/web';

import { ServiceContext, ServiceProvider, connect } from '../core/index';
import { FocusService, focusScope } from './index';

// The directive is invoked through use: in real apps; tests reference it
// directly so bundler tree-shaking of the import is also covered.
function mount(element: () => ReturnType<typeof Board>) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const dispose = render(element, host);
  return {
    host,
    cleanup: () => {
      dispose();
      host.remove();
    }
  };
}

let focusService!: FocusService;
const connectFocusProbe = connect('FocusProbe', (c) => {
  focusService = c.service(FocusService);
  return {};
});
function FocusProbe() {
  connectFocusProbe({});
  return null;
}

function Board() {
  return (
    <div data-testid="board" use:focusScope={{ id: 'board' }}>
      <input data-testid="board-input" />
      <div data-testid="editor" use:focusScope={{ id: 'editor' }}>
        <input data-testid="editor-input" />
      </div>
    </div>
  );
}

describe('FocusService (headless)', () => {
  it('tracks the innermost scope containing the focus target, path innermost-first', () => {
    const context = new ServiceContext({ scopeId: 'focus1' });
    try {
      const service = context.get(FocusService);
      const outer = document.createElement('div');
      const inner = document.createElement('div');
      const leaf = document.createElement('span');
      inner.appendChild(leaf);
      outer.appendChild(inner);
      document.body.appendChild(outer);
      service.registerScope('board', outer);
      service.registerScope('editor', inner);

      expect(service.activeScope()).toBeNull();
      service.noteFocusChange(leaf);
      expect(service.activeScope()).toBe('editor');
      expect(service.activeScopePath.get()).toEqual(['editor', 'board']);

      service.noteFocusChange(outer);
      expect(service.activeScope()).toBe('board');
      expect(service.activeScopePath.get()).toEqual(['board']);

      service.noteFocusChange(null);
      expect(service.activeScope()).toBeNull();
      expect(service.activeScopePath.get()).toEqual([]);
      outer.remove();
    } finally {
      context.dispose();
    }
  });

  it('focus(scopeId) focuses the scope element and activates the scope', () => {
    const context = new ServiceContext({ scopeId: 'focus2' });
    try {
      const service = context.get(FocusService);
      const el = document.createElement('div');
      el.tabIndex = -1;
      document.body.appendChild(el);
      service.registerScope('panel', el);

      service.focus('panel');
      expect(document.activeElement).toBe(el);
      expect(service.activeScope()).toBe('panel');

      // Unknown scope: no-op, state unchanged.
      service.focus('nope');
      expect(service.activeScope()).toBe('panel');
      el.remove();
    } finally {
      context.dispose();
    }
  });

  it('unregistering a scope removes it from the active path', () => {
    const context = new ServiceContext({ scopeId: 'focus3' });
    try {
      const service = context.get(FocusService);
      const outer = document.createElement('div');
      const inner = document.createElement('div');
      outer.appendChild(inner);
      document.body.appendChild(outer);
      service.registerScope('board', outer);
      const unregisterEditor = service.registerScope('editor', inner);
      service.noteFocusChange(inner);
      expect(service.activeScopePath.get()).toEqual(['editor', 'board']);

      unregisterEditor();
      expect(service.activeScopePath.get()).toEqual(['board']);
      expect(service.focus('editor')).toBeUndefined(); // gone: no-op
      outer.remove();
    } finally {
      context.dispose();
    }
  });

  it('capture/restore is a stack over the focused element', () => {
    const context = new ServiceContext({ scopeId: 'focus4' });
    try {
      const service = context.get(FocusService);
      const first = document.createElement('input');
      const second = document.createElement('input');
      document.body.append(first, second);

      first.focus();
      service.capture();
      second.focus();
      service.capture();
      first.focus();

      service.restore();
      expect(document.activeElement).toBe(second);
      service.restore();
      expect(document.activeElement).toBe(first);
      // Empty stack: no-op.
      service.restore();
      expect(document.activeElement).toBe(first);
      first.remove();
      second.remove();
    } finally {
      context.dispose();
    }
  });

  it('restore skips elements that have left the document', () => {
    const context = new ServiceContext({ scopeId: 'focus5' });
    try {
      const service = context.get(FocusService);
      const gone = document.createElement('input');
      document.body.appendChild(gone);
      gone.focus();
      service.capture();
      gone.remove();
      service.restore();
      expect(document.activeElement).toBe(document.body);
    } finally {
      context.dispose();
    }
  });

  it('owns nested overlays, traps Tab, and restores focus in stack order', () => {
    const context = new ServiceContext({ scopeId: 'focus-overlays' });
    try {
      const service = context.get(FocusService);
      const outside = document.createElement('button');
      const outer = document.createElement('div');
      const first = document.createElement('button');
      const last = document.createElement('button');
      const inner = document.createElement('div');
      const innerButton = document.createElement('button');
      outer.append(first, last);
      inner.appendChild(innerButton);
      document.body.append(outside, outer, inner);

      outside.focus();
      const leaveOuter = service.enterOverlay(outer);
      expect(service.hasOverlay()).toBe(true);
      expect(service.overlayDepth.get()).toBe(1);
      expect(document.activeElement).toBe(first);

      service.trapOverlayTab(outer, new KeyboardEvent('keydown', { key: 'Tab', cancelable: true }));
      expect(document.activeElement).toBe(last);
      service.trapOverlayTab(outer, new KeyboardEvent('keydown', { key: 'Tab', cancelable: true }));
      expect(document.activeElement).toBe(first);
      service.trapOverlayTab(
        outer,
        new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true })
      );
      expect(document.activeElement).toBe(last);

      const leaveInner = service.enterOverlay(inner);
      expect(service.overlayDepth.get()).toBe(2);
      expect(document.activeElement).toBe(innerButton);
      leaveInner();
      expect(document.activeElement).toBe(last);
      leaveOuter();
      expect(service.hasOverlay()).toBe(false);
      expect(document.activeElement).toBe(outside);
      outside.remove();
      outer.remove();
      inner.remove();
    } finally {
      context.dispose();
    }
  });

  it('an overlay freezes the working scope; the active scope still empties', () => {
    const context = new ServiceContext({ scopeId: 'focus-working' });
    try {
      const service = context.get(FocusService);
      const board = document.createElement('div');
      const boardInput = document.createElement('input');
      board.appendChild(boardInput);
      const overlay = document.createElement('div');
      const overlayInput = document.createElement('input');
      overlay.appendChild(overlayInput);
      document.body.append(board, overlay);
      service.registerScope('board', board, () => ({ cardId: 'card-1' }));

      boardInput.focus();
      service.noteFocusChange(boardInput);
      expect(service.activeScope()).toBe('board');
      expect(service.workingScope()).toBe('board');

      // Opening the overlay moves real focus out of every scope.
      const leave = service.enterOverlay(overlay);
      expect(service.activeScope()).toBeNull();
      expect(service.activeData()).toBeNull();
      // The palette still knows where the user was working, and on what.
      expect(service.workingScope()).toBe('board');
      expect(service.workingData()).toEqual({ cardId: 'card-1' });

      leave();
      expect(service.workingScope()).toBe('board');
      expect(service.activeScope()).toBe('board');
      board.remove();
      overlay.remove();
    } finally {
      context.dispose();
    }
  });

  it('a scope that unmounts under an open overlay leaves the frozen path too', () => {
    const context = new ServiceContext({ scopeId: 'focus-working-gone' });
    try {
      const service = context.get(FocusService);
      const board = document.createElement('div');
      const boardInput = document.createElement('input');
      board.appendChild(boardInput);
      const overlay = document.createElement('div');
      overlay.appendChild(document.createElement('input'));
      document.body.append(board, overlay);
      const unregister = service.registerScope('board', board, () => ({ cardId: 'card-1' }));

      boardInput.focus();
      service.noteFocusChange(boardInput);
      const leave = service.enterOverlay(overlay);
      expect(service.workingScope()).toBe('board');

      unregister();
      expect(service.workingScope()).toBeNull();
      expect(service.workingData()).toBeNull();

      leave();
      board.remove();
      overlay.remove();
    } finally {
      context.dispose();
    }
  });

  it('reads scope data through the accessor, and by id', () => {
    const context = new ServiceContext({ scopeId: 'focus-data' });
    try {
      const service = context.get(FocusService);
      const editor = document.createElement('div');
      document.body.appendChild(editor);
      const [documentId, setDocumentId] = createSignal('doc-1');
      service.registerScope('editor', editor, () => ({ documentId: documentId() }));

      service.noteFocusChange(editor);
      expect(service.activeData()).toEqual({ documentId: 'doc-1' });
      expect(service.dataFor('editor')).toEqual({ documentId: 'doc-1' });

      // A payload change never re-registers the scope, so the path holds.
      setDocumentId('doc-2');
      expect(service.activeData()).toEqual({ documentId: 'doc-2' });
      expect(service.activeScope()).toBe('editor');

      expect(service.dataFor('nothing')).toBeNull();
      editor.remove();
    } finally {
      context.dispose();
    }
  });
});

describe('use:focusScope directive', () => {
  it('a data change keeps the scope registered and the path intact', () => {
    const [documentId, setDocumentId] = createSignal('doc-1');
    const { host, cleanup } = mount(() => (
      <ServiceProvider scopeId="focus-dom3">
        <FocusProbe />
        <div data-testid="editor" use:focusScope={{ id: 'editor', data: { documentId: documentId() } }}>
          <input data-testid="editor-input" />
        </div>
      </ServiceProvider>
    ));
    try {
      (host.querySelector('[data-testid=editor-input]') as HTMLInputElement).focus();
      expect(focusService.activeScope()).toBe('editor');
      expect(focusService.activeData()).toEqual({ documentId: 'doc-1' });

      setDocumentId('doc-2');
      expect(focusService.activeScope()).toBe('editor');
      expect(focusService.activeData()).toEqual({ documentId: 'doc-2' });
    } finally {
      cleanup();
    }
  });

  it('maintains activeScope through real focusin/focusout events', () => {
    const { host, cleanup } = mount(() => (
      <ServiceProvider scopeId="focus-dom">
        <FocusProbe />
        <Board />
      </ServiceProvider>
    ));
    try {
      expect(focusService.activeScope()).toBeNull();

      (host.querySelector('[data-testid=editor-input]') as HTMLInputElement).focus();
      expect(focusService.activeScope()).toBe('editor');
      expect(focusService.activeScopePath.get()).toEqual(['editor', 'board']);

      (host.querySelector('[data-testid=board-input]') as HTMLInputElement).focus();
      expect(focusService.activeScope()).toBe('board');

      (host.querySelector('[data-testid=board-input]') as HTMLInputElement).blur();
      expect(focusService.activeScope()).toBeNull();
    } finally {
      cleanup();
    }
  });

  it('makes the scope element programmatically focusable and unregisters on unmount', () => {
    const [show, setShow] = createSignal(true);
    const { host, cleanup } = mount(() => (
      <ServiceProvider scopeId="focus-dom2">
        <FocusProbe />
        <Show when={show()}>
          <Board />
        </Show>
      </ServiceProvider>
    ));
    try {
      const board = host.querySelector('[data-testid=board]') as HTMLElement;
      expect(board.getAttribute('tabindex')).toBe('-1');
      focusService.focus('board');
      expect(document.activeElement).toBe(board);
      expect(focusService.activeScope()).toBe('board');

      // Unmounting the scoped subtree unregisters both scopes and clears
      // them from the active path.
      setShow(false);
      expect(focusService.activeScopePath.get()).toEqual([]);
    } finally {
      cleanup();
    }
  });
});
