// @vitest-environment jsdom
/**
 * Same-name siblings collapse into one `Thing[]` row, and that row has to
 * behave like every other row: click to open it, hover to see what it covers.
 *
 * This matters far more since the component library joined the tree. A catalog
 * page is dozens of identical parts, so the LIST row is most of what a reader
 * touches — and it was the one row with no hover wiring at all.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'solid-js/web';
import { For, createSignal, useContext } from 'solid-js';

import { componentRoot, connect, view, viewRoot, setWheelDevMode } from '../core';
import { WheelContext, type WheelContextValue } from '../core/context';
import type { DebugRegistry, InstanceTreeNode } from '../core/debug-registry';
import { WheelApp } from './wheel-app';

let teardown: (() => void) | null = null;
let setRowCount: ((count: number) => void) | null = null;
let context: WheelContextValue | null = null;

const connectRow = connect('CatalogRow', () => view({ ok: () => true }, {}));

function CatalogRow(props: { readonly index: number }) {
  connectRow(props);
  return <div use:componentRoot data-testid={`row-${props.index}`} />;
}

function Catalog() {
  const [count, setCount] = createSignal(3);
  setRowCount = setCount;
  return (
    <div use:viewRoot={'Catalog'}>
      <For each={Array.from({ length: count() }, (_, index) => index)}>
        {(index) => <CatalogRow index={index} />}
      </For>
    </div>
  );
}

function testid(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
}

/** The live registry behind the mounted app. */
function treeRegistry(): DebugRegistry {
  return context!.services.registry;
}

/** First node in the tree matching a predicate, depth first. */
function findNode(
  nodes: readonly InstanceTreeNode[],
  match: (node: InstanceTreeNode) => boolean
): InstanceTreeNode | undefined {
  for (const node of nodes) {
    if (match(node)) return node;
    const found = findNode(node.children, match);
    if (found) return found;
  }
  return undefined;
}

/** Every row currently rendered in the components pane. */
function rows(): HTMLElement[] {
  return [...testid('wheel-pane-components')!.querySelectorAll<HTMLElement>('[data-tree-row]')];
}

/**
 * Open rows until the wanted label appears. The tree starts collapsed, so a
 * group several levels down is not in the DOM until its ancestors are open —
 * and opening them by clicking is exactly what this file is about.
 */
function openUntil(label: string): HTMLElement {
  for (let depth = 0; depth < 8; depth += 1) {
    const found = rows().find((row) => row.textContent?.includes(label));
    if (found) return found;
    const next = rows().find((row) => row.textContent?.startsWith('▸'));
    if (!next) break;
    next.click();
  }
  throw new Error(`no row labelled ${label}; tree reads: ${rows().map((r) => r.textContent).join(' | ')}`);
}

function mount(): void {
  setWheelDevMode(true);
  const host = document.createElement('div');
  document.body.appendChild(host);
  const Probe = () => {
    context = useContext(WheelContext)!;
    return null;
  };
  teardown = render(
    () => (
      <WheelApp>
        <Probe />
        <Catalog />
      </WheelApp>
    ),
    host
  );
  testid('wheel-debug-toggle')!.click();
}

afterEach(() => {
  teardown?.();
  teardown = null;
  setRowCount = null;
  context = null;
  setWheelDevMode(false);
  document.body.innerHTML = '';
  // The panel remembers whether it was open. Left set, the next test's toggle
  // CLOSES it instead of opening it.
  localStorage.clear();
});

describe('same-name groups in the component tree', () => {
  it('opens and closes when its row is clicked, like any other row', () => {
    mount();
    const group = openUntil('CatalogRow[]');

    const before = rows().length;
    group.click();
    expect(rows().length).toBeGreaterThan(before);

    group.click();
    expect(rows().length).toBe(before);
  });

  it('gives the tree a key that survives what instanceId does not', () => {
    mount();
    setRowCount!(1);
    const registry = treeRegistry();

    // One of a name: the id shows bare.
    const before = registry.instanceTree();
    const soleRow = findNode(before, (node) => node.name === 'CatalogRow')!;
    expect(soleRow.instanceId).toBe('CatalogRow');

    // A second mounts, and the first is RENAMED — that is the documented
    // behaviour of instanceId, and the reason the panel must not key on it.
    setRowCount!(2);
    const after = registry.instanceTree();
    const renamed = findNode(after, (node) => node.key === soleRow.key)!;
    expect(renamed.instanceId).not.toBe(soleRow.instanceId);
    expect(renamed.instanceId).toBe('CatalogRow#1');

    // The key did not move, which is what keeps an expanded row expanded.
    expect(renamed.key).toBe(soleRow.key);
  });

  it('highlights every member when the group row is hovered', () => {
    mount();
    const group = openUntil('CatalogRow[]');

    const outlined = (): number =>
      [0, 1, 2].filter((index) => testid(`row-${index}`)?.style.outline !== '').length;
    expect(outlined()).toBe(0);

    group.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));

    // A group stands for its members, so hovering it has to show all of them.
    // Highlighting nothing made the row look inert and left no way to see what
    // a collapsed list of forty parts actually covers.
    expect(outlined()).toBe(3);

    group.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
    expect(outlined()).toBe(0);
  });
});
