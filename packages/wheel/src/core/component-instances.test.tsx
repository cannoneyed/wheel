// @vitest-environment jsdom
/**
 * Instance registration: every connect() mount creates an
 * InstanceRecord, `use:componentRoot` attaches the component's DOM to it,
 * and unmount removes everything — For rows, Show toggles, fragments, and
 * per-instance names all covered against a real DOM.
 */
import { describe, expect, it } from 'vitest';
import { For, Show, createSignal } from 'solid-js';
import { render } from 'solid-js/web';

import {
  Service,
  ServiceProvider,
  connect,
  componentRoot,
  isWheelDevMode,
  setWheelDevMode,
  view,
  viewRoot
} from './index';
import { ServiceContext } from './services';
import { DebugRegistry } from './debug-registry';
import { WheelContext } from './context';
import { useContext } from 'solid-js';

class ItemService extends Service {
  readonly label = this.atom('hello', 'label');
  readonly rename = this.action((next: string) => this.label.set(next), 'rename');
}

const connectItem = connect('Item', (c) => {
  const itemService = c.service(ItemService);
  return view({ label: itemService.label.get }, { rename: itemService.rename });
});

function Item(props: { testid: string }) {
  const state = connectItem(props);
  return (
    <div use:componentRoot data-testid={props.testid}>
      {state.label}
    </div>
  );
}

/** Grabs the registry + service context from inside the provider tree. */
function ContextProbe(props: { onContext: (services: ServiceContext) => void }) {
  const context = useContext(WheelContext)!;
  props.onContext(context.services);
  return null;
}

function mount(element: () => unknown) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  let services!: ServiceContext;
  const dispose = render(
    () => (
      <ServiceProvider>
        <ContextProbe onContext={(s) => (services = s)} />
        {element() as never}
      </ServiceProvider>
    ),
    host
  );
  return {
    host,
    services: () => services,
    registry: () => services.registry,
    cleanup: () => {
      dispose();
      host.remove();
    }
  };
}

describe('instance registry + use:componentRoot', () => {
  it('mount registers an instance with its element, live state, and actions; unmount removes it', () => {
    const app = mount(() => <Item testid="solo" />);
    const registry = app.registry();
    const instances = registry.instances();
    expect(instances.map((instance) => instance.instanceId)).toEqual(['Item']);

    const [instance] = instances;
    expect([...instance.elements]).toEqual([app.host.querySelector('[data-testid="solo"]')]);
    expect(instance.state()).toEqual({ label: 'hello' });
    expect(instance.actions).toEqual(['rename']);

    app.cleanup();
    expect(registry.instances()).toEqual([]);
  });

  it('state() is LIVE — it re-reads the real getters after a service mutation', () => {
    const app = mount(() => <Item testid="solo" />);
    const [instance] = app.registry().instances();
    expect(instance.state()).toEqual({ label: 'hello' });

    app.services().get(ItemService).rename('world');
    expect(instance.state()).toEqual({ label: 'world' });
    expect(app.host.textContent).toContain('world');
    app.cleanup();
  });

  it('a For list mints one instance per row and drops exactly the removed row', () => {
    const [rows, setRows] = createSignal(['a', 'b', 'c']);
    const app = mount(() => <For each={rows()}>{(row) => <Item testid={row} />}</For>);
    const registry = app.registry();
    expect(registry.instances()).toHaveLength(3);

    setRows(['a', 'c']);
    expect(registry.instances()).toHaveLength(2);
    // Every remaining instance still points at a CONNECTED element.
    for (const instance of registry.instances()) {
      for (const element of instance.elements) {
        expect(element.isConnected).toBe(true);
      }
    }
    app.cleanup();
  });

  it('a root inside <Show> detaches its element when hidden and re-attaches when shown', () => {
    const [visible, setVisible] = createSignal(true);
    const connectToggling = connect('Toggling', () => view({}, {}));
    function Toggling() {
      connectToggling({});
      return (
        <Show when={visible()}>
          <div use:componentRoot data-testid="toggle" />
        </Show>
      );
    }
    const app = mount(() => <Toggling />);
    const instance = app.registry().instances().find((record) => record.name === 'Toggling')!;
    expect(instance.elements.size).toBe(1);

    setVisible(false);
    expect(instance.elements.size).toBe(0); // element gone, instance still mounted

    setVisible(true);
    expect(instance.elements.size).toBe(1);
    app.cleanup();
  });

  it('a fragment component attaches EVERY marked root to one instance', () => {
    const connectPair = connect('Pair', () => view({}, {}));
    function Pair() {
      connectPair({});
      return (
        <>
          <div use:componentRoot data-testid="left" />
          <div use:componentRoot data-testid="right" />
        </>
      );
    }
    const app = mount(() => <Pair />);
    const instance = app.registry().instances().find((record) => record.name === 'Pair')!;
    expect(instance.elements.size).toBe(2);
    app.cleanup();
  });

  it('per-instance connect names carry into instance ids', () => {
    const connectNamed = connect(
      (props: { id: string }) => `row:${props.id}`,
      () => view({}, {})
    );
    function Named(props: { id: string }) {
      connectNamed(props);
      return <div use:componentRoot />;
    }
    const app = mount(() => (
      <>
        <Named id="alpha" />
        <Named id="beta" />
      </>
    ));
    const ids = app
      .registry()
      .instances()
      .map((instance) => instance.instanceId);
    expect(ids).toContain('row:alpha');
    expect(ids).toContain('row:beta');
    app.cleanup();
  });

  it('ids number ONLY when a name repeats: one instance is bare, siblings get #1/#2', () => {
    const [rows, setRows] = createSignal(['a', 'b', 'c']);
    const app = mount(() => <For each={rows()}>{(row) => <Item testid={row} />}</For>);
    const registry = app.registry();
    expect(registry.instances().map((i) => i.instanceId)).toEqual(['Item#1', 'Item#2', 'Item#3']);

    // Drop the FIRST row: slot #1 frees while #2/#3 stay put.
    setRows(['b', 'c']);
    expect(registry.instances().map((i) => i.instanceId)).toEqual(['Item#2', 'Item#3']);

    // Down to ONE: the survivor drops its number entirely.
    setRows(['c']);
    expect(registry.instances().map((i) => i.instanceId)).toEqual(['Item']);
    expect(app.host.querySelector('[data-testid="c"]')!.getAttribute('data-wheel-id')).toBe('Item');

    // Growing back re-numbers everyone, DOM stamps included — a selector
    // copied from the tree never drifts from the tree.
    setRows(['c', 'd']);
    expect(app.host.querySelector('[data-testid="c"]')!.getAttribute('data-wheel-id')).toBe('Item#3');

    // The next mount takes the smallest free slot — stable across reloads.
    setRows(['b', 'c', 'd']);
    expect(
      registry
        .instances()
        .map((i) => i.instanceId)
        .sort()
    ).toEqual(['Item#1', 'Item#2', 'Item#3']);
    app.cleanup();
  });

  it('records owner-chain parent links and assembles the instance tree', () => {
    const connectOuter = connect('Outer', () => view({}, {}));
    const connectInner = connect('Inner', () => view({}, {}));
    const connectSibling = connect('Sibling', () => view({}, {}));
    function Inner() {
      connectInner({});
      return <span use:componentRoot />;
    }
    function Sibling() {
      connectSibling({});
      return <span use:componentRoot />;
    }
    function Outer() {
      connectOuter({});
      return (
        <div use:componentRoot>
          <Inner />
          <Sibling />
        </div>
      );
    }
    const app = mount(() => <Outer />);
    const registry = app.registry();
    const byName = (name: string) => registry.instances().find((r) => r.name === name)!;
    expect(byName('Inner').parentId).toBe('Outer#1'); // stable key, not display id
    // The SECOND child's parent is still Outer — sibling stamps don't leak.
    expect(byName('Sibling').parentId).toBe('Outer#1');
    expect(byName('Outer').parentId).toBeNull();

    const tree = registry.instanceTree();
    const outer = tree.find((node) => node.name === 'Outer')!;
    expect(outer.children.map((child) => child.name)).toEqual(['Inner', 'Sibling']);
    app.cleanup();
  });

  it('the tree follows DOM containment even when owner hints lie (production sibling-owner sharing)', () => {
    // Production Solid gives sibling component bodies a SHARED owner, so the
    // mount-time owner walk records the PREVIOUS SIBLING as parent — the tree
    // degenerated into a linked list until containment took over. Simulate
    // exactly that: parentId hints form a chain, the DOM says siblings.
    const registry = new DebugRegistry();
    const host = document.createElement('main');
    document.body.appendChild(host);
    const panelEl = document.createElement('header');
    const listEl = document.createElement('ul');
    host.appendChild(panelEl);
    host.appendChild(listEl);
    const badgeEl = document.createElement('span');
    panelEl.appendChild(badgeEl);

    const panel = registry.registerInstance('Panel', {}, { kind: 'view', parentId: null });
    const badge = registry.registerInstance('Badge', {}, { kind: 'connected', parentId: 'Panel#1' });
    // The lie: List's owner hint says Badge is its parent (previous sibling).
    const list = registry.registerInstance('List', {}, { kind: 'connected', parentId: 'Badge#1' });
    panel.record.elements.add(panelEl);
    badge.record.elements.add(badgeEl);
    list.record.elements.add(listEl);

    const tree = registry.instanceTree();
    expect(tree.map((node) => node.instanceId)).toEqual(['Panel', 'List']);
    expect(tree[0].children.map((node) => node.instanceId)).toEqual(['Badge']);

    // Headless instances (no elements) fall back to the hint.
    registry.registerInstance('Headless', {}, { kind: 'connected', parentId: 'Panel#1' });
    const withHeadless = registry.instanceTree();
    expect(withHeadless.find((n) => n.instanceId === 'Panel')!.children.map((n) => n.instanceId)).toEqual([
      'Badge',
      'Headless'
    ]);
    host.remove();
  });

  it('invoke() calls a shape action by name and throws a listing for unknown names', () => {
    const app = mount(() => <Item testid="solo" />);
    const [instance] = app.registry().instances();
    instance.invoke('rename', ['renamed']);
    expect(instance.state()).toEqual({ label: 'renamed' });
    expect(() => instance.invoke('nope', [])).toThrow(/no action 'nope'.*rename/);
    app.cleanup();
  });

  it('use:viewRoot registers dumb components (dev): kind, parent chain, DOM stamp, cleanup', () => {
    expect(isWheelDevMode()).toBe(true); // vitest runs with the bundler DEV signal on
    const connectHost = connect('Host', () => view({}, {}));
    function Avatar() {
      return <img use:viewRoot={'Avatar'} data-testid="avatar" />;
    }
    const connectLeaf = connect('Leaf', () => view({}, {}));
    function Leaf() {
      connectLeaf({});
      return <b use:componentRoot />;
    }
    /** A dumb layer BETWEEN two connected components — the tree must chain through it. */
    function Card() {
      return (
        <section use:viewRoot={'Card'}>
          <Leaf />
        </section>
      );
    }
    function Host() {
      connectHost({});
      return (
        <div use:componentRoot>
          <Avatar />
          <Card />
        </div>
      );
    }
    const app = mount(() => <Host />);
    const registry = app.registry();
    const byName = (name: string) => registry.instances().find((r) => r.name === name)!;

    expect(byName('Avatar').kind).toBe('view');
    expect(byName('Avatar').parentId).toBe('Host#1');
    expect(byName('Avatar').state()).toEqual({});
    expect(byName('Avatar').actions).toEqual([]);
    // The dumb layer is a real tree node: Leaf's parent is Card, Card's is Host.
    expect(byName('Card').parentId).toBe('Host#1');
    expect(byName('Leaf').parentId).toBe('Card#1');
    // Dev selector stamps, both directives.
    expect(app.host.querySelector('[data-testid="avatar"]')!.getAttribute('data-wheel-id')).toBe('Avatar');

    app.cleanup();
    expect(registry.instances()).toEqual([]);
  });

  it('use:viewRoot is a no-op outside dev mode', () => {
    setWheelDevMode(false);
    try {
      function Avatar() {
        return <img use:viewRoot={'Avatar'} data-testid="avatar" />;
      }
      const app = mount(() => <Avatar />);
      expect(app.registry().instances()).toEqual([]);
      expect(app.host.querySelector('[data-testid="avatar"]')!.hasAttribute('data-wheel-id')).toBe(false);
      app.cleanup();
    } finally {
      setWheelDevMode(true);
    }
  });

  it('instanceAt resolves the INNERMOST instance for nested components', () => {
    const connectOuter = connect('Outer', () => view({}, {}));
    const connectInner = connect('Inner', () => view({}, {}));
    function Inner() {
      connectInner({});
      return <span use:componentRoot data-testid="inner" />;
    }
    function Outer() {
      connectOuter({});
      return (
        <div use:componentRoot data-testid="outer">
          <Inner />
        </div>
      );
    }
    const app = mount(() => <Outer />);
    const registry = app.registry();
    const innerEl = app.host.querySelector('[data-testid="inner"]')!;
    const outerEl = app.host.querySelector('[data-testid="outer"]')!;
    expect(registry.instanceAt(innerEl)?.name).toBe('Inner');
    expect(registry.instanceAt(outerEl)?.name).toBe('Outer');
    app.cleanup();
  });
});
