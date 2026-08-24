// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createRoot, createSignal } from 'solid-js';
import { createValueChanged } from './createValueChanged';

describe('createValueChanged', () => {
  it('does not invoke onChange on setup', async () => {
    const onChange = vi.fn();

    createRoot(() => {
      const [value] = createSignal(1);
      createValueChanged(value, onChange);
    });

    await Promise.resolve();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('invokes onChange with the previous value once the accessor changes', async () => {
    const onChange = vi.fn();
    let setValue!: (next: number) => void;

    createRoot(() => {
      const [value, setter] = createSignal(1);
      setValue = setter;
      createValueChanged(value, onChange);
    });

    await Promise.resolve();
    setValue(2);
    await Promise.resolve();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(1);

    setValue(3);
    await Promise.resolve();

    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('does not invoke onChange when set to the same value', async () => {
    const onChange = vi.fn();
    let setValue!: (next: number) => void;

    createRoot(() => {
      const [value, setter] = createSignal(1);
      setValue = setter;
      createValueChanged(value, onChange);
    });

    await Promise.resolve();
    setValue(1);
    await Promise.resolve();

    expect(onChange).not.toHaveBeenCalled();
  });

  it('stops firing once the owning scope is disposed', async () => {
    const onChange = vi.fn();
    let setValue!: (next: number) => void;
    let dispose!: () => void;

    createRoot((d) => {
      dispose = d;
      const [value, setter] = createSignal(1);
      setValue = setter;
      createValueChanged(value, onChange);
    });

    dispose();
    setValue(2);
    await Promise.resolve();

    expect(onChange).not.toHaveBeenCalled();
  });
});
