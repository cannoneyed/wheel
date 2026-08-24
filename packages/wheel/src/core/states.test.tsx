// @vitest-environment jsdom
/**
 * defineStates + StateMount: a state renders the component with the stubbed
 * shape and NO providers; unknown state names fail loudly.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'solid-js/web';

import { connect } from './connect';
import { view } from './view';
import { defineStates, StateMount } from './states';

const connectBadge = connect('Badge', (c) => {
  // Real declaration path is irrelevant here — states always stub it.
  void c;
  return view({ count: () => 0 }, { reset: () => {} });
});

function Badge(props: { label?: string }) {
  const state = connectBadge({});
  return (
    <span data-testid="badge">
      {props.label ?? 'n'}: {state.count}
    </span>
  );
}

const badgeStates = defineStates({
  name: 'Badge',
  component: Badge,
  connection: connectBadge,
  states: {
    three: { shape: { count: 3, reset: () => {} }, props: { label: 'unread' } },
    zero: { shape: { count: 0, reset: () => {} } }
  }
});

function mount(element: () => unknown) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const dispose = render(element as never, host);
  return { host, cleanup: () => (dispose(), host.remove()) };
}

describe('StateMount', () => {
  it('renders a named state with its shape and props — no providers anywhere', () => {
    const app = mount(() => <StateMount definition={badgeStates} state="three" />);
    expect(app.host.querySelector('[data-testid="badge"]')!.textContent).toBe('unread: 3');
    app.cleanup();
  });

  it('renders another state of the same component with default props', () => {
    const app = mount(() => <StateMount definition={badgeStates} state="zero" />);
    expect(app.host.querySelector('[data-testid="badge"]')!.textContent).toBe('n: 0');
    app.cleanup();
  });

  it('throws with the available state names for an unknown state', () => {
    expect(() => mount(() => <StateMount definition={badgeStates} state="nope" />)).toThrow(
      /'Badge' has no state 'nope'.*three, zero/
    );
  });
});
