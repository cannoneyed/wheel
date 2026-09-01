// @vitest-environment jsdom
/**
 * <WheelApp/>: providers + dev-gated dock chrome. The app renders in one
 * stable Frame column; the dock opens docked or overlay; the component tree
 * section lists mounted instances; production mode renders children only.
 */
import { describe, expect, it, afterEach, beforeEach } from 'vitest';
import { render } from 'solid-js/web';

import {
  Service,
  Show,
  connect,
  componentRoot,
  setWheelDevMode,
  useSignal,
  view,
  viewRoot,
  type ContextClient
} from '../core';
import { createSignal, onCleanup, onMount } from 'solid-js';

import { WheelApp } from './wheel-app';

class GreetService extends Service {
  /** Identity that survives minification (see require-service-name). */
  static override serviceName = 'GreetService';

  readonly who = this.atom('world', 'who');
  readonly rename = this.action((next: string) => this.who.set(next), 'rename');
}

const connectGreeting = connect('Greeting', (c) => {
  const greetService = c.service(GreetService);
  return view({ who: greetService.who.get }, { rename: greetService.rename });
});

function Greeting() {
  const state = connectGreeting({});
  return <p use:componentRoot data-testid="greeting">{`hi ${state.who}`}</p>;
}

function Card() {
  return (
    <section use:viewRoot={'Card'}>
      <Greeting />
    </section>
  );
}

let appClicks = 0;
const connectClicky = connect('Clicky', () => view({}, {}));
/** Records every press the APP receives — must stay at 0 while picking. */
function Clicky() {
  connectClicky({});
  return (
    <button
      use:componentRoot
      data-testid="clicky"
      onPointerDown={() => (appClicks += 1)}
      onClick={() => (appClicks += 1)}
    />
  );
}

const connectRow = connect('Row', () => view({}, {}));
/** Three of these mount together — the tree must collapse them into Row[]. */
function Row(props: { n: number }) {
  connectRow(props);
  return <li use:componentRoot data-testid={`row-${props.n}`} />;
}

/** Takes props AND holds local state — both must surface in the tree. */
const connectLabeled = connect('Labeled', () => view({ tag: () => 'T' }, {}));
function Labeled(props: { title: string; count: number; onPick: () => void }) {
  connectLabeled(props);
  const [draft] = useSignal('typing…', 'draft');
  return (
    <aside use:componentRoot data-testid="labeled">
      {props.title}
      {draft()}
    </aside>
  );
}

/** A *System-named view component — lifts to the top of its bucket. */
function FakeToastSystem() {
  return <output use:viewRoot={'FakeToastSystem'} />;
}

const [gateOpen, setGateOpen] = createSignal(false);

const providerCases: ReadonlyArray<readonly [string, ContextClient | null]> = [
  ['clientless', null],
  ['client-backed', { onChange: () => () => {} }]
];

/** Root-position wheel <Show>: the tree must say "hidden", not "no DOM". */
const connectGated = connect('Gated', () => view({ open: gateOpen }, {}));
function Gated() {
  const state = connectGated({});
  return (
    <Show when={state.open}>
      <i use:componentRoot data-testid="gated" />
    </Show>
  );
}

/** Renders nothing, ever — the headless case, which must NOT read as hidden. */
const connectHeadless = connect('Headless', () => view({}, {}));
function Headless() {
  connectHeadless({});
  return null;
}

/** Framework-grouped dumb component (the kit components' object form). */
function FakeKitWidget() {
  return <ins use:viewRoot={{ name: 'FakeKitWidget', group: 'framework' }} />;
}

let dispose: (() => void) | null = null;
let host: HTMLElement | null = null;

function mountApp() {
  host = document.createElement('div');
  document.body.appendChild(host);
  dispose = render(
    () => (
      <WheelApp>
        {/* DOM-less components first: they have no containment position, so
            they fall back to the owner hint — registering them before
            anything stamps an owner keeps them at the top level. */}
        <Gated />
        <Headless />
        <Card />
        <Clicky />
        <ul use:viewRoot={'RowList'}>
          <Row n={1} />
          <Row n={2} />
          <Row n={3} />
        </ul>
        <Labeled title="hello" count={3} onPick={() => {}} />
        <FakeToastSystem />
        <FakeKitWidget />
      </WheelApp>
    ),
    host
  );
}

const testid = (id: string): HTMLElement | null => document.querySelector(`[data-testid="${id}"]`);

/**
 * Open a component's data sub-view.
 *
 * Props, state and actions are no longer rows nested under the node — four
 * groups under every open node made the tree unscannable — so a test that
 * wants a component's data asks for it the way a person does.
 */
function inspect(name: string): void {
  const panel = testid('wheel-debug-panel')!;
  const node = panel.querySelector(`[data-tree-node="${name}"]`);
  const toggle = node?.querySelector<HTMLButtonElement>('[data-testid="wheel-tree-inspect"]');
  if (!toggle) throw new Error(`no row for ${name}: ${panel.textContent?.slice(0, 300)}`);
  toggle.click();
}

/** Open every closed row, so a nested node is in the DOM to inspect. */
function openTree(): void {
  const panel = testid('wheel-debug-panel')!;
  for (let pass = 0; pass < 20; pass += 1) {
    const closed = [...panel.querySelectorAll<HTMLElement>('[data-tree-row]')].find((row) =>
      row.textContent?.startsWith('▸')
    );
    if (!closed) return;
    closed.click();
  }
}

describe('WheelApp', () => {
  beforeEach(() => {
    localStorage.clear();
    setWheelDevMode(true);
  });
  afterEach(() => {
    dispose?.();
    dispose = null;
    host?.remove();
    host = null;
    setWheelDevMode(true);
  });

  it('renders the app closed with the toggle chip; opening shows the docked panel with its sections', () => {
    mountApp();
    expect(testid('greeting')!.textContent).toBe('hi world');
    expect(testid('wheel-debug-panel')).toBeNull();

    testid('wheel-debug-toggle')!.click();
    const panel = testid('wheel-debug-panel')!;
    expect(panel.textContent).toContain('state tree');
    expect(panel.textContent).toContain('components');
    expect(panel.textContent).toContain('errors');
    // The app is still mounted and untouched.
    expect(testid('greeting')!.textContent).toBe('hi world');
  });

  it('the component tree section lists the full tree — view layers included, chrome pruned', () => {
    mountApp();
    testid('wheel-debug-toggle')!.click();
    const panel = testid('wheel-debug-panel')!;
    // Debug chrome is pruned from the display: Card (a view component!) is a root.
    expect(panel.textContent).toContain('Card');
    expect(panel.textContent).not.toContain('InspectorSystem');
    // Nodes default closed — expanding Card reveals its connected child.
    expect(panel.textContent).not.toContain('Greeting');
    // Deepest match = the summary row carrying the click handler (its
    // wrapper div has identical textContent and comes first in order).
    const cardRow = [...panel.querySelectorAll<HTMLElement>('[data-tree-row]')].find(
      (row) => row.textContent?.replace(/[◆▪◎]/g, '') === '▸Card'
    );
    expect(cardRow).toBeTruthy();
    cardRow!.click();
    expect(panel.textContent).toContain('Greeting');
    // Open state persists to the shared storage key (SHELL-16 contract).
    expect(localStorage.getItem('wheel.debug-panel.open')).toBe('open');
  });

  it('toggling open/close does not remount the app subtree', () => {
    mountApp();
    const before = testid('greeting');
    testid('wheel-debug-toggle')!.click(); // open
    expect(testid('greeting')).toBe(before);
    testid('wheel-debug-panel')!.querySelector<HTMLElement>('[data-testid="wheel-debug-toggle"]')!.click(); // close
    expect(testid('greeting')).toBe(before);
  });

  it.each(providerCases)('keeps one live host subtree for a %s app', (_name, client) => {
    let mounts = 0;
    let cleanups = 0;

    function HostTreeProbe() {
      // Imperative lifecycle boundary: count each live host subtree.
      onMount(() => (mounts += 1));
      onCleanup(() => (cleanups += 1));
      return <main use:viewRoot={'HostTreeProbe'} data-testid="host-tree-probe" />;
    }

    host = document.createElement('div');
    document.body.appendChild(host);
    dispose = render(
      () => (
        <WheelApp client={client}>
          <HostTreeProbe />
        </WheelApp>
      ),
      host
    );

    expect(mounts - cleanups).toBe(1);
    if (client === null) {
      testid('wheel-debug-toggle')!.click();
      expect(mounts - cleanups).toBe(1);
      testid('wheel-debug-panel')!.querySelector<HTMLElement>('[data-testid="wheel-debug-toggle"]')!.click();
      expect(mounts - cleanups).toBe(1);
    }

    dispose();
    dispose = null;
    expect(mounts - cleanups).toBe(0);
  });

  it('the component tree buckets by group: App open with systems lifted to its top level', () => {
    mountApp();
    testid('wheel-debug-toggle')!.click();
    const panel = testid('wheel-debug-panel')!;
    // App bucket is open by default: Card AND the lifted system are visible.
    expect(panel.textContent).toContain('App(7)');
    expect(panel.textContent).toContain('Card');
    expect(panel.textContent).toContain('FakeToastSystem');
    // Framework bucket exists but starts CLOSED — its member stays hidden.
    expect(panel.textContent).toContain('Framework(1)');
    expect(panel.textContent).not.toContain('FakeKitWidget');
  });

  it('expanding a connected node shows an open, accented connected group (and a closed actions group)', () => {
    mountApp();
    testid('wheel-debug-toggle')!.click();
    const panel = testid('wheel-debug-panel')!;
    openTree();
    inspect('Greeting');
    // The shape field renders directly ('who: "world"'), with no 'state' parent.
    expect(panel.textContent).toContain('who:');
    expect(panel.textContent).toContain('"world"');
    expect(panel.textContent).not.toContain('▸state');
    // Actions are a closed dictionary. Scoped to the components pane: the
    // state tree lists a service's actions too, and matching the whole panel
    // catches that instead.
    const components = testid('wheel-pane-components')!;
    expect(components.textContent).toContain('actions(1)');
    expect(components.textContent).not.toMatch(/actions\(1\)rename/);
  });

  it('distinguishes a component hidden by a wheel <Show> from one that just renders no DOM', () => {
    setGateOpen(false);
    mountApp();
    testid('wheel-debug-toggle')!.click();
    const panel = testid('wheel-debug-panel')!;
    // The gate is closed: its condition said no, and the tree says so.
    expect(panel.textContent).toContain('Gated⊘ hidden');
    // Headless renders nothing but nothing CLAIMS to hide it — different label.
    expect(panel.textContent).toContain('Headless⊘ no DOM');

    // Open the gate: the component appears and both markers clear.
    setGateOpen(true);
    expect(testid('gated')).not.toBeNull();
    expect(panel.textContent).not.toContain('Gated⊘');
    setGateOpen(false);
  });

  it('shows a component\'s props and local signals as their own accented groups', () => {
    mountApp();
    testid('wheel-debug-toggle')!.click();
    const panel = testid('wheel-debug-panel')!;
    openTree();
    inspect('Labeled');

    // props: data comes through as data; a callback is NAMED, not expanded.
    expect(panel.textContent).toContain('props{3}');
    expect(panel.textContent).toContain('title:');
    expect(panel.textContent).toContain('"hello"');
    expect(panel.textContent).toContain('count:');
    expect(panel.textContent).toContain('"<fn onPick>"');

    // local: the useSignal name and its live value.
    expect(panel.textContent).toContain('local(1)');
    expect(panel.textContent).toContain('draft:');
    expect(panel.textContent).toContain('"typing…"');

    // …and the connect shape stays its own separate group.
    expect(panel.textContent).toContain('connected{1}');
  });

  it('collapses same-name siblings into one list node, closed by default', () => {
    mountApp();
    testid('wheel-debug-toggle')!.click();
    const panel = testid('wheel-debug-panel')!;
    const listRow = [...panel.querySelectorAll<HTMLElement>('[data-tree-row]')].find(
      (row) => row.textContent?.replace(/[◆▪◎]/g, '') === '▸RowList'
    );
    listRow!.click();

    // The three Rows collapse into one closed group — members hidden.
    expect(panel.textContent).toContain('Row[](3)');
    expect(panel.textContent).not.toContain('Row#1');

    const group = [...panel.querySelectorAll<HTMLElement>('[data-tree-row]')].find(
      (row) => row.textContent?.replace(/[◆▪◎]/g, '') === '▸Row[](3)'
    );
    group!.click();
    expect(panel.textContent).toContain('Row#1');
    expect(panel.textContent).toContain('Row#3');
  });

  it('panes toggle off and on, and the choice persists', () => {
    mountApp();
    testid('wheel-debug-toggle')!.click();
    expect(testid('wheel-pane-components')).not.toBeNull();

    testid('wheel-pane-toggle-components')!.click();
    expect(testid('wheel-pane-components')).toBeNull();
    expect(JSON.parse(localStorage.getItem('wheel.debug-panel.panes')!).components).toBe(false);

    testid('wheel-pane-toggle-components')!.click();
    expect(testid('wheel-pane-components')).not.toBeNull();
  });

  it('a divider sits between every pair of visible panes, and never above the first', () => {
    mountApp();
    testid('wheel-debug-toggle')!.click();
    // Three panes visible → two dividers, none before the first pane.
    expect(testid('wheel-pane-handle-state')).toBeNull();
    for (const id of ['components', 'errors']) {
      expect(testid(`wheel-pane-handle-${id}`)).not.toBeNull();
    }
    // Hiding a pane removes its divider too.
    testid('wheel-pane-toggle-components')!.click();
    expect(testid('wheel-pane-handle-components')).toBeNull();
    expect(testid('wheel-pane-handle-errors')).not.toBeNull();
  });

  it('while picking, a full-screen shield keeps every press away from the app', () => {
    appClicks = 0;
    mountApp();
    testid('wheel-debug-toggle')!.click();

    // Baseline: without the picker, the app receives its own clicks.
    testid('clicky')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(appClicks).toBe(1);

    testid('wheel-tree-pick')!.click();
    const overlay = testid('wheel-picker-overlay')!;
    const original = document.elementFromPoint;
    document.elementFromPoint = () => testid('clicky')!;
    try {
      overlay.dispatchEvent(new MouseEvent('pointerdown', { clientX: 5, clientY: 5, bubbles: true }));
      overlay.dispatchEvent(new MouseEvent('click', { clientX: 5, clientY: 5, bubbles: true }));
    } finally {
      document.elementFromPoint = original;
    }
    // The press landed on the shield, not the button underneath it.
    expect(appClicks).toBe(1);
    // …and it still did its job: the component got revealed.
    expect(testid('wheel-debug-panel')!.textContent).toContain('Clicky');
  });

  it('the ⌖ picker reveals the clicked component: expanded, selected, highlighted path', () => {
    mountApp();
    testid('wheel-debug-toggle')!.click();
    const panel = testid('wheel-debug-panel')!;
    expect(panel.textContent).not.toContain('who:'); // Greeting starts collapsed

    testid('wheel-tree-pick')!.click();
    // A full-screen shield goes up so the app never sees the press.
    const overlay = testid('wheel-picker-overlay')!;
    expect(overlay).not.toBeNull();

    const greetingEl = testid('greeting')!;
    // jsdom has no layout — stub the point lookup the picker uses.
    const original = document.elementFromPoint;
    document.elementFromPoint = () => greetingEl;
    try {
      overlay.dispatchEvent(new MouseEvent('click', { clientX: 50, clientY: 50, bubbles: true }));
    } finally {
      document.elementFromPoint = original;
    }
    // Picking ends, and the shield comes down with it.
    expect(testid('wheel-picker-overlay')).toBeNull();
    // The tree opened down to Greeting and its inline state is visible.
    expect(panel.textContent).toContain('who:');
    expect(panel.textContent).toContain('"world"');
    // The revealed row is marked selected.
    const node = panel.querySelector('[data-tree-node="Greeting"]') as HTMLElement;
    expect(node).not.toBeNull();
    expect(node.style.background).not.toBe('');
  });

  it('a tree row opens and closes when you click it', () => {
    mountApp();
    testid('wheel-debug-toggle')!.click();
    const pane = testid('wheel-pane-components')!;
    const rows = () => pane.querySelectorAll('[data-tree-row]').length;

    const before = rows();
    const first = pane.querySelector('[data-tree-row]') as HTMLElement;
    expect(first).not.toBeNull();

    // Clicking the row is the only way to walk the tree by hand. It broke
    // once and nothing caught it, because every other test reaches its node
    // through the ⌖ picker's `reveal`, which expands paths directly.
    first.click();
    expect(rows()).toBeLessThan(before);

    first.click();
    expect(rows()).toBe(before);
  });

  it('docked mode squashes the whole page via the document margin; overlay and close restore it', () => {
    mountApp();
    testid('wheel-debug-toggle')!.click();
    expect(document.documentElement.style.marginRight).toBe('420px');

    testid('wheel-debug-mode')!.click(); // → overlay: floats, no squash
    expect(document.documentElement.style.marginRight).toBe('');

    testid('wheel-debug-mode')!.click(); // → back to docked
    expect(document.documentElement.style.marginRight).toBe('420px');
    testid('wheel-debug-panel')!.querySelector<HTMLElement>('[data-testid="wheel-debug-toggle"]')!.click();
    expect(document.documentElement.style.marginRight).toBe('');
  });

  it('mode button switches to overlay and persists the choice', () => {
    mountApp();
    testid('wheel-debug-toggle')!.click();
    testid('wheel-debug-mode')!.click();
    expect(localStorage.getItem('wheel.debug-panel.mode')).toBe('overlay');
    // Panel still present (overlay chrome), app untouched.
    expect(testid('wheel-debug-panel')).not.toBeNull();
    expect(testid('greeting')!.textContent).toBe('hi world');
  });

  it('outside dev mode there is no chrome at all — children only', () => {
    setWheelDevMode(false);
    mountApp();
    expect(testid('greeting')!.textContent).toBe('hi world');
    expect(testid('wheel-debug-toggle')).toBeNull();
    expect(testid('wheel-debug-panel')).toBeNull();
    expect(document.querySelector('[data-wheel-id]')).toBeNull();
  });
});
