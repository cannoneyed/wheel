// @vitest-environment jsdom
/**
 * The library is part of the component tree.
 *
 * For a while it was not, and the reason was a layering bet: `components` was
 * a leaf that "depends on nothing internal", so a part could not reach
 * `viewRoot`. The effect was that the one page dedicated to wheel components
 * was the one page where wheel components could not be inspected, selected, or
 * annotated — an agent walking the tree saw an app's own markup and a hole
 * where the entire UI library should be.
 *
 * Registration happens in `renderElement` rather than in 188 call sites,
 * because every part renders through it and every part already declares the
 * `slot` that names it.
 */
import { describe, expect, it, afterEach, beforeEach } from 'vitest';
import { render } from 'solid-js/web';
import { useContext } from 'solid-js';

import { ServiceProvider, setWheelDevMode } from '../../core';
import { WheelContext, type WheelContextValue } from '../../core/context';
import { Radio } from '../radio';
import { RadioGroup } from '../radio-group';

let teardown: (() => void) | null = null;

// Registration is a dev-only surface, and this project runs with the flag off.
beforeEach(() => setWheelDevMode(true));

afterEach(() => {
  teardown?.();
  teardown = null;
  setWheelDevMode(false);
  document.body.innerHTML = '';
});

/** Render a fragment inside a provider and hand back the live registry. */
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

describe('library parts in the component tree', () => {
  it('registers each part under a name derived from its slot', () => {
    const context = mount(() => (
      <RadioGroup aria-label="states" defaultValue="a">
        <Radio.Root value="a">
          <Radio.Indicator />
        </Radio.Root>
      </RadioGroup>
    ));

    const names = context.services.registry.instances().map((record) => record.name);
    // `slot: 'radio-root'` is the identity the part already declares for app
    // CSS; the tree uses the same string so the two can never disagree.
    expect(names).toContain('RadioRoot');
    expect(names).toContain('RadioGroup');
  });

  it('stamps data-wheel-id, so a part can be selected from the DOM', () => {
    mount(() => (
      <RadioGroup aria-label="states" defaultValue="a">
        <Radio.Root value="a" />
      </RadioGroup>
    ));

    // This is what the inspector hit-test and the annotator's anchor read.
    const root = document.querySelector('[data-slot="radio-root"]');
    expect(root?.getAttribute('data-wheel-id')).toBe('RadioRoot');
  });

  it('finds the part by name, the way an agent asks for it', () => {
    const context = mount(() => (
      <RadioGroup aria-label="states" defaultValue="a">
        <Radio.Root value="a" />
      </RadioGroup>
    ));

    const record = context.services.registry.instance('RadioRoot');
    expect(record).toBeDefined();
    expect(record?.kind).toBe('view');
  });

  it('costs nothing outside a provider, so a part is still usable in plain Solid', () => {
    // `viewRoot` is inert without a WheelContext. That is what keeps the new
    // `components → core` edge from making the library require an app.
    const host = document.createElement('div');
    document.body.appendChild(host);
    teardown = render(
      () => (
        <RadioGroup aria-label="states" defaultValue="a">
          <Radio.Root value="a" />
        </RadioGroup>
      ),
      host
    );

    expect(document.querySelector('[data-slot="radio-root"]')).toBeTruthy();
    expect(document.querySelector('[data-wheel-id]')).toBeNull();
  });

  it('costs nothing in production either, where the whole surface is off', () => {
    setWheelDevMode(false);
    mount(() => (
      <RadioGroup aria-label="states" defaultValue="a">
        <Radio.Root value="a" />
      </RadioGroup>
    ));

    // A registration per rendered part would be real weight in a shipped app.
    // `viewRoot` returns on a flag check before it touches anything.
    expect(document.querySelector('[data-slot="radio-root"]')).toBeTruthy();
    expect(document.querySelector('[data-wheel-id]')).toBeNull();
  });
});
