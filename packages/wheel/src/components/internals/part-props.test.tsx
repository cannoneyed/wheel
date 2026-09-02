// @vitest-environment jsdom
/**
 * A library part publishes BOTH halves: what it was given, and what it made
 * of that.
 *
 * `CheckboxRoot` showed twelve values under one heading — `checked`,
 * `disabled`, `readOnly`, `required`, `indeterminate`, `size`, `status`,
 * `touched`, `dirty`, `valid`, `filled`, `focused` — with no way to tell which
 * of them anyone had asked for. That is a component's STATE, which lists every
 * key it has, defaults included; the props beside it are the two the caller
 * actually set.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from 'solid-js/web';
import { useContext } from 'solid-js';

import { ServiceProvider, setWheelDevMode } from '../../core';
import { WheelContext, type WheelContextValue } from '../../core/context';
import { Checkbox } from '../checkbox';

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

describe('a library part in the tree', () => {
  it('lists the props it was given, not only the state it derived', () => {
    const context = mount(() => (
      <Checkbox.Root data-wheel-role="terms" defaultChecked>
        <Checkbox.Indicator />
      </Checkbox.Root>
    ));

    const record = context.services.registry
      .instances()
      .find((instance) => instance.instanceId === 'CheckboxRoot(terms)')!;

    // What the caller set.
    const given = record.props();
    expect(given).toHaveProperty('defaultChecked', true);
    expect(given).toHaveProperty('data-wheel-role', 'terms');

    // What the component made of it — everything it has, defaults included.
    const state = record.state();
    expect(state).toHaveProperty('checked', true);
    expect(Object.keys(state).length).toBeGreaterThan(Object.keys(given).length);
  });
});
