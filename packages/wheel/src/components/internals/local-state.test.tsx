// @vitest-environment jsdom
/**
 * The library's own state is visible in the component tree.
 *
 * A library part keeps its state in `createControllableSignal`, not in a
 * `useSignal` the tree could name — so the tree showed a `Checkbox` driven by
 * a checked state and said nothing about it. The part now hands its whole
 * reactive state object to `use:viewRoot`, and the tree reads it live exactly
 * as it reads a `connect()` shape.
 *
 * Fifty-one library files carried a pragma opting out, all with the same
 * reason: the primitives "cannot import Wheel application state ... without a
 * layer cycle". That was never true — `core` does not import `components` — and
 * the DAG allows the edge now, so the opt-out is gone with it.
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

describe('library state in the component tree', () => {
  it('names the state an uncontrolled component keeps for itself', () => {
    const context = mount(() => (
      <Checkbox.Root data-wheel-role="terms" defaultChecked>
        <Checkbox.Indicator />
      </Checkbox.Root>
    ));

    const record = context.services.registry
      .instances()
      .find((instance) => instance.instanceId === 'CheckboxRoot(terms)');
    expect(record).toBeDefined();

    // The panel reads the record's state exactly as it reads a connect shape.
    const state = record!.state();
    expect(Object.keys(state).length).toBeGreaterThan(0);
    expect(state).toHaveProperty('checked', true);
  });

  it('reads the value live, not a copy taken at mount', () => {
    const context = mount(() => (
      <Checkbox.Root data-wheel-role="terms">
        <Checkbox.Indicator />
      </Checkbox.Root>
    ));
    const record = context.services.registry
      .instances()
      .find((instance) => instance.instanceId === 'CheckboxRoot(terms)')!;

    expect(record.state()).toHaveProperty('checked', false);
    document.querySelector<HTMLElement>('[data-wheel-role="terms"]')!.click();
    // Read live, not copied at mount.
    expect(record.state()).toHaveProperty('checked', true);
  });
});
