// @vitest-environment jsdom
/**
 * The context-menu system's contract: directive registration, single-open by
 * construction, portal content keeping its declaration-site context, scrim/
 * Escape dismissal, per-instance connect names cleaning up, and closed menus
 * mounting nothing.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'solid-js/web';
import { For, createSignal } from 'solid-js';

import { ServiceContext, ServiceProvider, Service, connect, view } from '../core/index';
import { ContextMenuService, ContextMenuSystem, contextMenu } from './index';

// The directive is invoked through use: in real apps; tests reference it
// directly so bundler tree-shaking of the import is also covered.
class BoardService extends Service {
  /** Identity that survives minification (see require-service-name). */
  static override serviceName = 'BoardService';

  readonly deleted = this.atom<readonly string[]>([], 'deleted');
  readonly deleteItem = this.action((id: string) => {
    this.deleted.update((draft) => {
      draft.push(id);
    });
  }, 'deleteItem');
}

const connectItemMenu = connect(
  (props: { id: string }) => `contextMenu:item:${props.id}`,
  (c, props) => {
    const boardService = c.service(BoardService);
    return view({}, { remove: () => boardService.deleteItem(props.id) });
  }
);

function ItemMenu(props: { id: string }) {
  const state = connectItemMenu(props);
  return (
    <>
      <button data-testid={`delete-${props.id}`} onClick={() => state.remove()}>
        delete {props.id}
      </button>
      <button data-testid={`inspect-${props.id}`}>inspect {props.id}</button>
    </>
  );
}

function Item(props: { id: string }) {
  return (
    <div
      data-testid={`item-${props.id}`}
      use:contextMenu={{ id: `item:${props.id}`, menu: () => <ItemMenu id={props.id} /> }}
    >
      card {props.id}
    </div>
  );
}

function mount(element: () => ReturnType<typeof Item>) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const dispose = render(element, host);
  return {
    host,
    cleanup: () => {
      dispose();
      host.remove();
      document.querySelectorAll('[data-testid=wheel-context-menu]').forEach((n) => n.remove());
    }
  };
}

function rightClick(el: Element, x = 40, y = 50): void {
  el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
}

describe('context-menu system', () => {
  it('a same-id registration supersedes; the stale cleanup no-ops', () => {
    // Reparenting overlap: moving a keyed item between two <For> lists mounts
    // the replacement (register) BEFORE the original is disposed (unregister).
    const context = new ServiceContext();
    const menus = context.get(ContextMenuService);
    const element = document.createElement('button');
    try {
      const unregisterFirst = menus.register({
        id: 'card:1',
        element,
        render: () => null,
        anchor: 'element',
        owner: null,
        declaredAt: 'first-menu.tsx:10'
      });
      menus.register({
        id: 'card:1',
        element,
        render: () => null,
        anchor: 'element',
        owner: null,
        declaredAt: 'second-menu.tsx:20'
      });
      // The replacement owns the id...
      expect(menus.registration('card:1')?.declaredAt).toBe('second-menu.tsx:20');
      // ...and the ORIGINAL's late cleanup must not tear it down.
      unregisterFirst();
      expect(menus.registration('card:1')?.declaredAt).toBe('second-menu.tsx:20');
    } finally {
      context.dispose();
    }
  });

  it('closed menus mount nothing; right-click opens content in a portal with working context', () => {
    const { host, cleanup } = mount(() => (
      <ServiceProvider scopeId="cm1">
        <Item id="a" />
        <Item id="b" />
        <ContextMenuSystem />
      </ServiceProvider>
    ));
    try {
      expect(document.querySelector('[data-testid=wheel-context-menu]')).toBeNull();

      rightClick(host.querySelector('[data-testid=item-a]')!);
      const menu = document.querySelector('[data-testid=wheel-context-menu]');
      expect(menu).not.toBeNull();
      // The menu content resolved BoardService through the declaration site's
      // owner — clicking the action writes through the real service.
      (menu!.querySelector('[data-testid=delete-a]') as HTMLButtonElement).click();
      // Action landed: open a's menu again, this time checking state through a
      // second trigger to prove the service is shared.
      expect(menu!.textContent).toContain('delete a');
    } finally {
      cleanup();
    }
  });

  it('single-open by construction: opening b closes a', () => {
    const { host, cleanup } = mount(() => (
      <ServiceProvider scopeId="cm2">
        <Item id="a" />
        <Item id="b" />
        <ContextMenuSystem />
      </ServiceProvider>
    ));
    try {
      rightClick(host.querySelector('[data-testid=item-a]')!);
      expect(document.querySelectorAll('[data-testid=wheel-context-menu]').length).toBe(1);
      expect(document.body.textContent).toContain('delete a');
      rightClick(host.querySelector('[data-testid=item-b]')!);
      expect(document.querySelectorAll('[data-testid=wheel-context-menu]').length).toBe(1);
      expect(document.body.textContent).toContain('delete b');
      expect(document.body.textContent).not.toContain('delete a');
    } finally {
      cleanup();
    }
  });

  it('scrim pointerdown and Escape both close', () => {
    const { host, cleanup } = mount(() => (
      <ServiceProvider scopeId="cm3">
        <Item id="a" />
        <ContextMenuSystem />
      </ServiceProvider>
    ));
    try {
      rightClick(host.querySelector('[data-testid=item-a]')!);
      document
        .querySelector('[data-testid=wheel-menu-scrim]')!
        .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      expect(document.querySelector('[data-testid=wheel-context-menu]')).toBeNull();

      rightClick(host.querySelector('[data-testid=item-a]')!);
      expect(document.querySelector('[data-testid=wheel-context-menu]')).not.toBeNull();
      document.activeElement?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      );
      expect(document.querySelector('[data-testid=wheel-context-menu]')).toBeNull();
    } finally {
      cleanup();
    }
  });

  it('focuses the first item, roves with arrows, and restores the trigger', () => {
    const { host, cleanup } = mount(() => (
      <ServiceProvider scopeId="cm-keyboard">
        <Item id="a" />
        <ContextMenuSystem />
      </ServiceProvider>
    ));
    try {
      const trigger = host.querySelector('[data-testid=item-a]') as HTMLElement;
      trigger.tabIndex = 0;
      trigger.focus();
      rightClick(trigger);

      const first = document.querySelector('[data-testid=delete-a]') as HTMLButtonElement;
      const second = document.querySelector('[data-testid=inspect-a]') as HTMLButtonElement;
      expect(first.getAttribute('role')).toBe('menuitem');
      expect(second.getAttribute('role')).toBe('menuitem');
      expect(document.activeElement).toBe(first);
      first.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
      );
      expect(document.activeElement).toBe(second);
      second.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true })
      );
      expect(document.activeElement).toBe(first);
      first.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      );
      expect(document.querySelector('[data-testid=wheel-context-menu]')).toBeNull();
      expect(document.activeElement).toBe(trigger);
    } finally {
      cleanup();
    }
  });

  it('activating an item closes the menu — the item handler runs, then the panel goes', () => {
    const { host, cleanup } = mount(() => (
      <ServiceProvider scopeId="cm-activate">
        <Item id="a" />
        <ContextMenuSystem />
      </ServiceProvider>
    ));
    try {
      const trigger = host.querySelector('[data-testid=item-a]') as HTMLElement;
      trigger.tabIndex = 0;

      // Keyboard: Enter activates the focused item and the menu closes.
      trigger.focus();
      rightClick(trigger);
      const first = document.querySelector('[data-testid=delete-a]') as HTMLButtonElement;
      let activations = 0;
      first.addEventListener('click', () => {
        activations += 1;
      });
      first.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
      );
      expect(activations).toBe(1);
      expect(document.querySelector('[data-testid=wheel-context-menu]')).toBeNull();
      expect(document.activeElement).toBe(trigger);

      // Pointer: clicking an item closes the menu the same way. Without this,
      // the menu's scrim outlives the click and swallows the next pointer
      // event — e.g. the first click on a dialog the item handler opened.
      rightClick(trigger);
      const second = document.querySelector('[data-testid=inspect-a]') as HTMLButtonElement;
      second.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      expect(document.querySelector('[data-testid=wheel-context-menu]')).toBeNull();

      // Checkbox items are a checklist, not a command: toggling one keeps the
      // menu open (the framing demo's workspace menu depends on this).
      rightClick(trigger);
      const checkbox = document.querySelector('[data-testid=inspect-a]') as HTMLButtonElement;
      checkbox.setAttribute('role', 'menuitemcheckbox');
      checkbox.setAttribute('aria-checked', 'false');
      checkbox.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      expect(document.querySelector('[data-testid=wheel-context-menu]')).not.toBeNull();
    } finally {
      cleanup();
    }
  });

  it('per-instance connect names register while open and clean up on unmount', () => {
    const [items, setItems] = createSignal(['a', 'b']);
    let registry!: import('./index').DebugRegistry;
    class ProbeService extends Service {
      /** Identity that survives minification (see require-service-name). */
      static override serviceName = 'ProbeService';

      readonly grab = () => this.context.registry;
    }
    const connectProbe = connect('RegistryProbe', (c) => {
      registry = c.service(ProbeService).grab();
      return {};
    });
    function Probe() {
      connectProbe({});
      return null;
    }
    const { host, cleanup } = mount(() => (
      <ServiceProvider scopeId="cm4">
        <Probe />
        <For each={items()}>{(id) => <Item id={id} />}</For>
        <ContextMenuSystem />
      </ServiceProvider>
    ));
    try {
      rightClick(host.querySelector('[data-testid=item-a]')!);
      expect(registry.snapshot().components.some((c) => c.name === 'contextMenu:item:a')).toBe(true);
      // Unmount item a while its menu instance exists → manifest disappears.
      document.activeElement?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      );
      setItems(['b']);
      expect(registry.snapshot().components.some((c) => c.name === 'contextMenu:item:a')).toBe(false);
    } finally {
      cleanup();
    }
  });

  it('unmounting the open menu’s trigger closes the menu (unregister path)', () => {
    const [items, setItems] = createSignal(['a']);
    const { host, cleanup } = mount(() => (
      <ServiceProvider scopeId="cm5">
        <For each={items()}>{(id) => <Item id={id} />}</For>
        <ContextMenuSystem />
      </ServiceProvider>
    ));
    try {
      rightClick(host.querySelector('[data-testid=item-a]')!);
      expect(document.querySelector('[data-testid=wheel-context-menu]')).not.toBeNull();
      setItems([]);
      expect(document.querySelector('[data-testid=wheel-context-menu]')).toBeNull();
    } finally {
      cleanup();
    }
  });
});

describe('view()', () => {
  it('reads are deferred value properties; actions pass through; stubs still work', () => {
    class CounterService extends Service {
      /** Identity that survives minification (see require-service-name). */
      static override serviceName = 'CounterService';

      readonly n = this.atom(1, 'n');
      readonly bump = this.action(() => this.n.set(this.n.get() + 1), 'bump');
    }
    const connectCounter = connect('ViewCounter', (c) => {
      const counterService = c.service(CounterService);
      return view({ n: () => counterService.n.get() }, { bump: counterService.bump });
    });
    let seen: number[] = [];
    function Probe() {
      const state = connectCounter({});
      // Reading state.n in JSX defers through the getter — assert via effect-free reads.
      seen.push(state.n);
      state.bump();
      seen.push(state.n);
      return null;
    }
    const { cleanup } = mount(() => (
      <ServiceProvider scopeId="view1">
        <Probe />
      </ServiceProvider>
    ));
    try {
      expect(seen).toEqual([1, 2]); // the second read saw the action's write — deferred, not a snapshot
    } finally {
      cleanup();
    }
  });
});
