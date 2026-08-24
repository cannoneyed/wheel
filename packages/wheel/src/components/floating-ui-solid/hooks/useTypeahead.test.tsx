// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createSignal } from 'solid-js';
import { render, fireEvent } from '@solidjs/testing-library';
import { useFloating } from './useFloating';
import { useTypeahead } from './useTypeahead';

interface ComboboxProps {
  onMatch?: (index: number) => void;
  onTyping?: (isTyping: boolean) => void;
  list?: Array<string>;
}

function Combobox(props: ComboboxProps) {
  const [open, setOpen] = createSignal(true);
  const [activeIndex, setActiveIndex] = createSignal<number | null>(null);
  const floating = useFloating({ open, onOpenChange: setOpen });
  // Read once at setup: this test component's props are static per render.
  const initialList =
    props.list ?? ['one', 'two', 'three'];
  const listRef: { current: Array<string | null> } = { current: initialList };
  const typeahead = useTypeahead(floating.context, {
    listRef,
    activeIndex,
    onMatch(index) {
      setActiveIndex(index);
      props.onMatch?.(index);
    },
    onTyping: props.onTyping,
  });

  return (
    <>
      <input
        role="combobox"
        data-testid="reference"
        ref={floating.refs.setReference}
        {...typeahead.reference}
      />
      <div role="listbox" ref={floating.refs.setFloating} {...typeahead.floating} />
    </>
  );
}

function press(element: Element, key: string) {
  fireEvent.keyDown(element, { key });
}

function type(element: Element, text: string) {
  for (const char of text) {
    press(element, char);
  }
}

describe('useTypeahead', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('matches the first item starting with the typed character', () => {
    const spy = vi.fn();
    const { getByRole } = render(() => <Combobox onMatch={spy} />);

    press(getByRole('combobox'), 't');

    expect(spy).toHaveBeenCalledWith(1);
  });

  it('rapidly cycles through items that start with the same letter', () => {
    const spy = vi.fn();
    const { getByRole } = render(() => <Combobox onMatch={spy} />);
    const input = getByRole('combobox');

    press(input, 't');
    expect(spy).toHaveBeenLastCalledWith(1);

    press(input, 't');
    expect(spy).toHaveBeenLastCalledWith(2);

    press(input, 't');
    expect(spy).toHaveBeenLastCalledWith(1);
  });

  it('bails out of rapid-cycling when the list has a double-letter word', () => {
    const spy = vi.fn();
    const { getByRole } = render(() => (
      <Combobox onMatch={spy} list={['apple', 'aaron', 'apricot']} />
    ));
    const input = getByRole('combobox');

    press(input, 'a');
    expect(spy).toHaveBeenLastCalledWith(0); // 'apple'

    // The list contains 'aaron' (two identical leading letters), so the
    // rapid re-cycling shortcut is disabled: this continues the session as
    // "aa" instead of resetting back to the first 'a' match.
    press(input, 'a');
    expect(spy).toHaveBeenLastCalledWith(1); // 'aaron'
  });

  it('matches multi-character strings and resets after the timeout', () => {
    const spy = vi.fn();
    const { getByRole } = render(() => (
      <Combobox onMatch={spy} list={['Toy Story 2', 'Toy Story 3', 'Toy Story 4']} />
    ));
    const input = getByRole('combobox');

    type(input, 'toy');
    expect(spy).toHaveBeenLastCalledWith(0);

    spy.mockReset();

    // Typing the same string again immediately continues the session and
    // finds no further match (already on the last matched item).
    type(input, 'toy');
    expect(spy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(750);

    type(input, 'toy');
    expect(spy).toHaveBeenLastCalledWith(1);
  });

  it('resets the typed string after the configured timeout', () => {
    const spy = vi.fn();
    const { getByRole } = render(() => <Combobox onMatch={spy} />);
    const input = getByRole('combobox');

    press(input, 't');
    expect(spy).toHaveBeenLastCalledWith(1);

    vi.advanceTimersByTime(750);

    // A fresh session: no item starts with 'x', so no new call.
    spy.mockReset();
    press(input, 'x');
    expect(spy).not.toHaveBeenCalled();
  });

  it('does not depend on locale-sensitive lowercasing', () => {
    const toLocaleLowerCase = String.prototype.toLocaleLowerCase;
    const spy = vi.fn();
    const toLocaleLowerCaseSpy = vi
      .spyOn(String.prototype, 'toLocaleLowerCase')
      .mockImplementation(function turkish(this: string) {
        return toLocaleLowerCase.call(this, 'tr');
      });

    try {
      const { getByRole } = render(() => <Combobox onMatch={spy} list={['Istanbul']} />);
      press(getByRole('combobox'), 'i');
      expect(spy).toHaveBeenCalledWith(0);
    } finally {
      toLocaleLowerCaseSpy.mockRestore();
    }
  });

  it('calls onTyping with typing activity and clears it after the timeout', () => {
    const spy = vi.fn();
    const { getByRole } = render(() => <Combobox onTyping={spy} />);
    const input = getByRole('combobox');
    input.focus();

    press(input, 't');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(true);

    vi.advanceTimersByTime(750);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith(false);
  });

  it('does not match on modifier-key combinations', () => {
    const spy = vi.fn();
    const { getByRole } = render(() => <Combobox onMatch={spy} />);
    fireEvent.keyDown(getByRole('combobox'), { key: 't', ctrlKey: true });
    expect(spy).not.toHaveBeenCalled();
  });

  describe('prop: enabled', () => {
    function DisabledCombobox(props: { onMatch: (index: number) => void }) {
      const [open, setOpen] = createSignal(true);
      const [activeIndex] = createSignal<number | null>(null);
      const floating = useFloating({ open, onOpenChange: setOpen });
      const listRef: { current: Array<string | null> } = { current: ['one', 'two'] };
      const typeahead = useTypeahead(floating.context, {
        listRef,
        activeIndex,
        onMatch: props.onMatch,
        enabled: () => false,
      });

      return <input role="combobox" ref={floating.refs.setReference} {...typeahead.reference} />;
    }

    it('does not match when disabled', () => {
      const spy = vi.fn();
      const { getByRole } = render(() => <DisabledCombobox onMatch={spy} />);
      press(getByRole('combobox'), 't');
      expect(spy).not.toHaveBeenCalled();
    });
  });
});
