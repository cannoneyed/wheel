// @vitest-environment jsdom
/**
 * A number answers "which of these", so it is scoped to SIBLINGS.
 *
 * The delete button inside `TodoRow#3` is the only delete button in that row.
 * It used to be `Button(delete)#3` — a number describing a position in a
 * page-wide list nobody was looking at, which also reshuffled whenever any
 * other row mounted. It is `Button(delete)`, and the row above it is what says
 * which one.
 *
 * The id is therefore unique among siblings rather than globally, and a
 * selector composes the way the tree reads:
 *
 *   [data-wheel-id="Row#2"] [data-wheel-id="Button(delete)"]
 *
 * The globally unique handle is `key`, which no surface displays.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from 'solid-js/web';
import { For, useContext } from 'solid-js';

import { ServiceProvider, setWheelDevMode, viewRoot } from '../../core';
import { WheelContext, type WheelContextValue } from '../../core/context';
import { Button } from '../button';

let teardown: (() => void) | null = null;

beforeEach(() => setWheelDevMode(true));

afterEach(() => {
  teardown?.();
  teardown = null;
  setWheelDevMode(false);
  document.body.innerHTML = '';
});

function Row(props: { readonly index: number }) {
  return (
    <div use:viewRoot={'Row'} data-testid={`row-${props.index}`}>
      <Button data-wheel-role="delete">×</Button>
    </div>
  );
}

function mount(): WheelContextValue {
  const host = document.createElement('div');
  document.body.appendChild(host);
  let context!: WheelContextValue;
  const Probe = () => {
    context = useContext(WheelContext)!;
    return null;
  };
  teardown = render(
    () => (
      <ServiceProvider>
        <Probe />
        <div use:viewRoot={'List'}>
          <For each={[0, 1, 2]}>{(index) => <Row index={index} />}</For>
        </div>
      </ServiceProvider>
    ),
    host
  );
  return context;
}

describe('sibling-scoped ids', () => {
  it('numbers the rows, because there are three of them under one parent', () => {
    const context = mount();
    const ids = context.services.registry.instances().map((record) => record.instanceId);
    expect(ids).toContain('Row#1');
    expect(ids).toContain('Row#2');
    expect(ids).toContain('Row#3');
  });

  it('does not number the only delete button in a row — in the registry', async () => {
    const context = mount();
    await Promise.resolve();
    // Through `instanceId`, not through the DOM stamp. Asserting only on the
    // stamp let a stale getter survive: the restamp was right and every
    // surface that asks the registry — the tree, the bridge, a note's anchor
    // — still said `Button(delete)#3`.
    const ids = context.services.registry
      .instances()
      .filter((record) => record.name === 'Button(delete)')
      .map((record) => record.instanceId);
    expect(ids).toHaveLength(3);
    expect(new Set(ids)).toEqual(new Set(['Button(delete)']));
  });

  it('does not number the only delete button in a row', async () => {
    mount();
    await Promise.resolve();
    const buttons = [...document.querySelectorAll('[data-wheel-role="delete"]')].map((el) =>
      el.getAttribute('data-wheel-id')
    );

    expect(buttons).toHaveLength(3);
    // Three of them, all called the same thing — because each is the only one
    // where it lives.
    expect(new Set(buttons)).toEqual(new Set(['Button(delete)']));
  });

  it('is selectable through its parent, which is what makes that safe', async () => {
    mount();
    await Promise.resolve();
    const second = document.querySelector('[data-wheel-id="Row#2"] [data-wheel-id="Button(delete)"]');
    expect(second).not.toBeNull();
    expect(second!.closest('[data-testid]')?.getAttribute('data-testid')).toBe('row-1');
  });

  it('keeps a globally unique key behind the display id', () => {
    const context = mount();
    const keys = context.services.registry
      .instances()
      .filter((record) => record.name === 'Button(delete)')
      .map((record) => record.key);

    expect(keys).toHaveLength(3);
    expect(new Set(keys).size).toBe(3);
  });
});
