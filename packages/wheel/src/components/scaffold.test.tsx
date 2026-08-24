// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';

describe('scaffold', () => {
  it('renders solid components with reactivity', async () => {
    const [count, setCount] = createSignal(0);
    const { getByRole } = render(() => (
      <button type="button" onClick={() => setCount((c) => c + 1)}>
        count: {count()}
      </button>
    ));
    const button = getByRole('button');
    expect(button).toHaveTextContent('count: 0');
    button.click();
    expect(button).toHaveTextContent('count: 1');
  });
});
