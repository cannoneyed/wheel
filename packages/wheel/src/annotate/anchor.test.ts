// @vitest-environment jsdom
/**
 * Anchors have one job: find the thing again later. These tests cover the
 * tiers that make "later" survive real change — an id that still exists, an id
 * that renumbered, a name that now appears twice, and a target that is simply
 * gone (which must stay visible as orphaned rather than silently re-point at
 * whatever is nearest).
 */
import { afterEach, describe, expect, it } from 'vitest';

import { DebugRegistry } from '../core/debug-registry';

import { anchorToInstance, describeElement, domPathOf, resolveAnchor } from './anchor';

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.body.innerHTML = '';
});

/** Register a mounted instance backed by a real element inside `parent`. */
function mount(registry: DebugRegistry, name: string, parent: Element = document.body): Element {
  const element = document.createElement('div');
  parent.appendChild(element);
  const { record, unregister } = registry.registerInstance(name, {});
  record.elements.add(element);
  element.setAttribute('data-wheel-id', record.instanceId);
  cleanups.push(unregister);
  return element;
}

describe('resolveAnchor', () => {
  it('finds the exact instance when nothing moved', () => {
    const registry = new DebugRegistry();
    const element = mount(registry, 'BoardCell:3-7');
    const anchor = anchorToInstance(registry, registry.instanceAt(element)!);

    const resolved = resolveAnchor(registry, anchor);
    expect(resolved.match).toBe('exact');
    expect(resolved.record?.instanceId).toBe('BoardCell:3-7');
  });

  it('re-finds a component whose id renumbered, by name', () => {
    const registry = new DebugRegistry();
    const first = mount(registry, 'TodoRow');
    const second = mount(registry, 'TodoRow');
    // Two live instances, so ids are now TodoRow#1 / TodoRow#2.
    const anchor = anchorToInstance(registry, registry.instanceAt(second)!);
    expect(anchor.instanceId).toBe('TodoRow#2');

    // The second unmounts; the survivor goes back to the bare name.
    cleanups.pop()!();
    second.remove();

    const resolved = resolveAnchor(registry, anchor);
    expect(resolved.match).toBe('renamed');
    expect(resolved.record?.instanceId).toBe('TodoRow');
    expect(registry.instanceAt(first)).toBe(resolved.record);
  });

  it('uses the ancestor chain to choose between same-named candidates', () => {
    const registry = new DebugRegistry();
    const left = document.createElement('section');
    const right = document.createElement('section');
    document.body.append(left, right);
    const leftPanel = mount(registry, 'LeftPanel', left);
    mount(registry, 'RightPanel', right);
    const target = mount(registry, 'Cell', leftPanel);
    mount(registry, 'Cell', right);

    const anchor = anchorToInstance(registry, registry.instanceAt(target)!);
    expect(anchor.ancestors).toContain('LeftPanel');

    // The exact id disappears (a rewrite renumbered everything), but the
    // ancestors still say which of the two Cells was meant.
    const resolved = resolveAnchor(registry, { ...anchor, instanceId: 'Cell#9' });
    expect(resolved.match).toBe('renamed');
    expect(resolved.record).toBe(registry.instanceAt(target));
  });

  it('reports an anchor whose target is gone as orphaned, not as the nearest thing', () => {
    const registry = new DebugRegistry();
    const element = mount(registry, 'BoardCell:3-7');
    const anchor = anchorToInstance(registry, registry.instanceAt(element)!);
    cleanups.pop()!();
    element.remove();
    mount(registry, 'SomethingElse');

    const resolved = resolveAnchor(registry, anchor);
    expect(resolved.match).toBe('orphaned');
    expect(resolved.record).toBeNull();
  });

  it('does not accept an id that now belongs to a different component', () => {
    const registry = new DebugRegistry();
    mount(registry, 'Widget');
    const resolved = resolveAnchor(registry, {
      kind: 'instance',
      instanceId: 'Widget',
      name: 'BoardCell',
      ancestors: [],
      rect: null,
      domPath: null
    });
    expect(resolved.match).toBe('orphaned');
  });
});

describe('element description', () => {
  it('names an element the way a human would', () => {
    const button = document.createElement('button');
    button.className = 'primary wide';
    expect(describeElement(button)).toBe('button.primary');
    button.id = 'save';
    expect(describeElement(button)).toBe('button#save');
  });

  it('builds a dom path that stops at the nearest id', () => {
    document.body.innerHTML = '<main id="root"><ul><li></li><li></li></ul></main>';
    const second = document.querySelectorAll('li')[1]!;
    expect(domPathOf(second)).toBe('#root > ul > li:nth-of-type(2)');
  });
});
