// @vitest-environment jsdom
/**
 * An anchor has one job: say what was under the rectangle.
 *
 * There is one anchor shape and one way to make it, because there is one
 * interaction. What these tests protect is that BOTH descriptions are recorded
 * whenever they exist — the component for a wheel app, the DOM path and the
 * sentence for a page wheel does not own — since the agent reading the note
 * later has no way to go back and look.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { DebugRegistry } from '../core/debug-registry';

import { CHROME_ATTRIBUTE, anchorToRegion, describeElement, domPathOf, targetsUnder } from './anchor';

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.body.innerHTML = '';
  // jsdom implements neither hit-test, so tests install their own; clear them
  // so one test's stack never answers another's question.
  Reflect.deleteProperty(document, 'elementFromPoint');
  Reflect.deleteProperty(document, 'elementsFromPoint');
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

/** jsdom lays nothing out, so a test says where an element is. */
function place(element: Element, rect: { x: number; y: number; width: number; height: number }): void {
  element.getBoundingClientRect = () =>
    ({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      top: rect.y,
      left: rect.x,
      right: rect.x + rect.width,
      bottom: rect.y + rect.height,
      toJSON: () => ({})
    }) as DOMRect;
}

describe('anchorToRegion', () => {
  it('names the component under the rectangle, and where it sits in the tree', () => {
    const registry = new DebugRegistry();
    const outer = mount(registry, 'Board');
    const inner = mount(registry, 'BoardCell:3-7', outer);
    place(outer, { x: 0, y: 0, width: 400, height: 400 });
    place(inner, { x: 40, y: 40, width: 80, height: 20 });

    const anchor = anchorToRegion(registry, { x: 30, y: 30, width: 120, height: 60 });

    expect(anchor.instanceId).toBe('BoardCell:3-7');
    expect(anchor.name).toBe('BoardCell:3-7');
    expect(anchor.ancestors.at(-1)).toContain('Board');
  });

  it('stores the rectangle exactly as it was drawn, in viewport coordinates', () => {
    const registry = new DebugRegistry();
    // A note describes a moment on screen. Nothing converts the rectangle into
    // a place in the document, and nothing adds the scroll offset back in.
    const rect = { x: 12, y: 34, width: 56, height: 78 };

    expect(anchorToRegion(registry, rect).rect).toEqual(rect);
  });

  it('describes plain DOM when no component claims the area', () => {
    const registry = new DebugRegistry();
    document.body.innerHTML =
      '<main id="root"><p>Wheel is a framework for reliable development by agents.</p></main>';
    const paragraph = document.querySelector('p')!;
    place(paragraph, { x: 0, y: 0, width: 300, height: 40 });
    // The rectangle's middle is what the hit-test asks about.
    document.elementFromPoint = () => paragraph;

    const anchor = anchorToRegion(registry, { x: 0, y: 0, width: 300, height: 40 });

    // Nothing to name as a component — but a docs paragraph still has a path
    // and a sentence, which is what makes the note worth reading later.
    expect(anchor.instanceId).toBeNull();
    expect(anchor.element).toBe('p');
    expect(anchor.domPath).toContain('#root');
    expect(anchor.text).toContain('Wheel is a framework');
  });

  it('looks through the annotator, not at it', () => {
    const registry = new DebugRegistry();
    document.body.innerHTML = '<p>the paragraph being complained about</p>';
    const paragraph = document.querySelector('p')!;
    const shield = document.createElement('div');
    shield.setAttribute(CHROME_ATTRIBUTE, '');
    document.body.appendChild(shield);
    // The real stack while dragging: the marquee's shield is over everything.
    document.elementsFromPoint = () => [shield, paragraph, document.body];

    const anchor = anchorToRegion(registry, { x: 0, y: 0, width: 300, height: 40 });

    // The bug this locks down: the note described the annotator's own overlay
    // — element `div`, no text — instead of the thing under it.
    expect(anchor.element).toBe('p');
    expect(anchor.text).toContain('the paragraph being complained about');
  });

  it('records the component AND the DOM, not one or the other', () => {
    const registry = new DebugRegistry();
    const element = mount(registry, 'BoardCell:3-7');
    element.id = 'cell';
    place(element, { x: 0, y: 0, width: 100, height: 100 });
    document.elementFromPoint = () => element;

    const anchor = anchorToRegion(registry, { x: 0, y: 0, width: 100, height: 100 });

    expect(anchor.instanceId).toBe('BoardCell:3-7');
    expect(anchor.domPath).toBe('#cell');
  });
});

describe('targetsUnder', () => {
  it('takes what the rectangle overlaps and leaves what it misses', () => {
    const registry = new DebugRegistry();
    const hit = mount(registry, 'Hit');
    const miss = mount(registry, 'Miss');
    place(hit, { x: 10, y: 10, width: 50, height: 50 });
    place(miss, { x: 500, y: 500, width: 50, height: 50 });

    const found = targetsUnder(registry, { x: 0, y: 0, width: 100, height: 100 });

    expect(found.map((target) => target.name)).toEqual(['Hit']);
  });
});

describe('element description', () => {
  it('names an element the way a human would', () => {
    document.body.innerHTML =
      '<button id="save">a</button><button class="primary big">b</button><input />';
    const [save, primary] = [...document.querySelectorAll('button')];

    expect(describeElement(save!)).toBe('button#save');
    expect(describeElement(primary!)).toBe('button.primary');
    expect(describeElement(document.querySelector('input')!)).toBe('input');
  });

  it('builds a dom path that stops at the nearest id', () => {
    document.body.innerHTML = '<div id="app"><section><p>a</p><p>b</p></section></div>';
    const second = document.querySelectorAll('p')[1]!;

    expect(domPathOf(second)).toBe('#app > section > p:nth-of-type(2)');
  });
});
