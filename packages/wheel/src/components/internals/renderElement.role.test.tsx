// @vitest-environment jsdom
/**
 * `data-wheel-role`: what THIS instance of a shared component is.
 *
 * A shared component has no identity of its own. The todos demo renders one
 * `Button` to add and one per row to delete, so the tree showed `Button#1`,
 * `Button#2`, `Button#3` — a numbering that names none of them and reshuffles
 * when a row mounts.
 *
 * The role is the caller supplying that identity, and it is folded into the
 * instance id rather than shown beside it: `Button(add)` is what the tree
 * prints, what `data-wheel-id` stamps, what an agent selects, and what a note's
 * anchor records. Being distinct, it usually needs no number at all.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from 'solid-js/web';
import { useContext } from 'solid-js';

import { ServiceProvider, setWheelDevMode } from '../../core';
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

function mount(children: () => unknown): WheelContextValue {
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
        {children() as never}
      </ServiceProvider>
    ),
    host
  );
  return context;
}

describe('data-wheel-role', () => {
  it('names the instance instead of numbering it', () => {
    const context = mount(() => (
      <>
        <Button data-wheel-role="add">add</Button>
        <Button data-wheel-role="delete">delete</Button>
      </>
    ));

    const names = context.services.registry.instances().map((record) => record.instanceId);
    expect(names).toContain('Button(add)');
    expect(names).toContain('Button(delete)');
    // Two Buttons, and neither needs a number: they are not the same thing.
    expect(names.some((name) => name.includes('#'))).toBe(false);
  });

  it('stamps the id it chose onto the DOM, so a selector still finds it', () => {
    mount(() => <Button data-wheel-role="add">add</Button>);

    const element = document.querySelector('[data-wheel-role="add"]');
    expect(element?.getAttribute('data-wheel-id')).toBe('Button(add)');
  });

  it('still numbers instances that genuinely share a role', () => {
    // Two delete buttons in two rows ARE the same thing, so they number — and
    // the number now means something, because the name already says which kind.
    const context = mount(() => (
      <>
        <Button data-wheel-role="delete">a</Button>
        <Button data-wheel-role="delete">b</Button>
      </>
    ));

    const names = context.services.registry.instances().map((record) => record.instanceId);
    expect(names).toContain('Button(delete)#1');
    expect(names).toContain('Button(delete)#2');
  });

  it('falls back to the bare part name when no role is given', () => {
    const context = mount(() => <Button>plain</Button>);

    const names = context.services.registry.instances().map((record) => record.instanceId);
    expect(names).toContain('Button');
  });
});
