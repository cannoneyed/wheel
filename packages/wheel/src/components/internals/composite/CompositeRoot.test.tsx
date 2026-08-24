// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { DirectionProvider } from '../../direction-provider';
import { CompositeItem } from './item/CompositeItem';
import { CompositeRoot } from './root/CompositeRoot';
import { gridNavigation } from './root/gridNavigation';

// The composite root defers the actual DOM `.focus()` call to a microtask
// (mirroring upstream, which waits for a FocusManager's `returnFocus` to run
// first). Tabindex updates are synchronous (driven by a signal), but focus
// assertions need a microtask flush.
function flushMicrotasks() {
  return Promise.resolve();
}

describe('Composite', () => {
  describe('roving tabindex', () => {
    it('gives the initially highlighted item tabindex 0 and others -1', () => {
      const { getByTestId } = render(() => (
        <CompositeRoot>
          <CompositeItem data-testid="1">1</CompositeItem>
          <CompositeItem data-testid="2">2</CompositeItem>
          <CompositeItem data-testid="3">3</CompositeItem>
        </CompositeRoot>
      ));

      expect(getByTestId('1')).toHaveAttribute('tabindex', '0');
      expect(getByTestId('2')).toHaveAttribute('tabindex', '-1');
      expect(getByTestId('3')).toHaveAttribute('tabindex', '-1');
    });

    it('does not add aria-orientation by itself', () => {
      const { container } = render(() => (
        <CompositeRoot orientation="horizontal">
          <CompositeItem>1</CompositeItem>
          <CompositeItem>2</CompositeItem>
        </CompositeRoot>
      ));

      expect(container.firstElementChild as HTMLElement).not.toHaveAttribute('aria-orientation');
    });
  });

  describe('uncontrolled mode', () => {
    it('ArrowDown moves the highlight and focus forward, ArrowUp moves it back', async () => {
      const { getByTestId } = render(() => (
        <CompositeRoot>
          <CompositeItem data-testid="1">1</CompositeItem>
          <CompositeItem data-testid="2">2</CompositeItem>
          <CompositeItem data-testid="3">3</CompositeItem>
        </CompositeRoot>
      ));

      const item1 = getByTestId('1');
      const item2 = getByTestId('2');
      const item3 = getByTestId('3');

      item1.focus();
      fireEvent.keyDown(item1, { key: 'ArrowDown' });
      await flushMicrotasks();

      expect(item2).toHaveAttribute('tabindex', '0');
      expect(item2).toHaveFocus();

      fireEvent.keyDown(item2, { key: 'ArrowDown' });
      await flushMicrotasks();

      expect(item3).toHaveAttribute('tabindex', '0');
      expect(item3).toHaveFocus();

      fireEvent.keyDown(item3, { key: 'ArrowUp' });
      await flushMicrotasks();

      expect(item2).toHaveAttribute('tabindex', '0');
      expect(item2).toHaveFocus();
    });

    it('ArrowRight moves the highlight forward in "both" orientation', async () => {
      const { getByTestId } = render(() => (
        <CompositeRoot>
          <CompositeItem data-testid="1">1</CompositeItem>
          <CompositeItem data-testid="2">2</CompositeItem>
        </CompositeRoot>
      ));

      const item1 = getByTestId('1');
      const item2 = getByTestId('2');

      item1.focus();
      fireEvent.keyDown(item1, { key: 'ArrowRight' });
      await flushMicrotasks();

      expect(item2).toHaveAttribute('tabindex', '0');
      expect(item2).toHaveFocus();
    });

    it('loops focus from the last item back to the first by default', async () => {
      const { getByTestId } = render(() => (
        <CompositeRoot>
          <CompositeItem data-testid="1">1</CompositeItem>
          <CompositeItem data-testid="2">2</CompositeItem>
        </CompositeRoot>
      ));

      const item1 = getByTestId('1');
      const item2 = getByTestId('2');

      item2.focus();
      fireEvent.keyDown(item2, { key: 'ArrowDown' });
      await flushMicrotasks();

      expect(item1).toHaveAttribute('tabindex', '0');
      expect(item1).toHaveFocus();
    });

    it('does not loop when loopFocus is false', async () => {
      const { getByTestId } = render(() => (
        <CompositeRoot loopFocus={false}>
          <CompositeItem data-testid="1">1</CompositeItem>
          <CompositeItem data-testid="2">2</CompositeItem>
        </CompositeRoot>
      ));

      const item2 = getByTestId('2');

      item2.focus();
      fireEvent.keyDown(item2, { key: 'ArrowDown' });
      await flushMicrotasks();

      expect(item2).toHaveAttribute('tabindex', '0');
      expect(item2).toHaveFocus();
    });

    it('calls onLoop and uses its return value', async () => {
      const onLoop = vi.fn(
        (_event: KeyboardEvent, _prevIndex: number, _nextIndex: number, _elements: unknown) => 1,
      );

      const { getByTestId } = render(() => (
        <CompositeRoot onLoop={onLoop}>
          <CompositeItem data-testid="1">1</CompositeItem>
          <CompositeItem data-testid="2">2</CompositeItem>
          <CompositeItem data-testid="3">3</CompositeItem>
        </CompositeRoot>
      ));

      const item3 = getByTestId('3');
      item3.focus();
      fireEvent.keyDown(item3, { key: 'ArrowDown' });
      await flushMicrotasks();

      expect(onLoop).toHaveBeenCalledOnce();
      const [event, prevIndex, nextIndex] = onLoop.mock.calls[0]!;
      expect((event as KeyboardEvent).key).toBe('ArrowDown');
      expect(prevIndex).toBe(2);
      expect(nextIndex).toBe(0);

      expect(getByTestId('2')).toHaveAttribute('tabindex', '0');
      expect(getByTestId('2')).toHaveFocus();
    });
  });

  describe('controlled mode', () => {
    it('follows the highlightedIndex prop and calls onHighlightedIndexChange', async () => {
      function App() {
        const [highlightedIndex, setHighlightedIndex] = createSignal(0);
        return (
          <CompositeRoot
            highlightedIndex={highlightedIndex()}
            onHighlightedIndexChange={setHighlightedIndex}
          >
            <CompositeItem data-testid="1">1</CompositeItem>
            <CompositeItem data-testid="2">2</CompositeItem>
            <CompositeItem data-testid="3">3</CompositeItem>
          </CompositeRoot>
        );
      }

      const { getByTestId } = render(() => <App />);

      const item1 = getByTestId('1');
      const item2 = getByTestId('2');

      item1.focus();
      fireEvent.keyDown(item1, { key: 'ArrowDown' });
      await flushMicrotasks();

      expect(item2).toHaveAttribute('tabindex', '0');
      expect(item2).toHaveFocus();
    });
  });

  describe('Home and End keys', () => {
    it('Home key moves focus to the first item', async () => {
      const { getByTestId } = render(() => (
        <CompositeRoot enableHomeAndEndKeys>
          <CompositeItem data-testid="1">1</CompositeItem>
          <CompositeItem data-testid="2">2</CompositeItem>
          <CompositeItem data-testid="3">3</CompositeItem>
        </CompositeRoot>
      ));

      const item1 = getByTestId('1');
      const item3 = getByTestId('3');

      item3.focus();
      fireEvent.keyDown(item3, { key: 'Home' });
      await flushMicrotasks();

      expect(item1).toHaveAttribute('tabindex', '0');
      expect(item1).toHaveFocus();
    });

    it('End key moves focus to the last item', async () => {
      const { getByTestId } = render(() => (
        <CompositeRoot enableHomeAndEndKeys>
          <CompositeItem data-testid="1">1</CompositeItem>
          <CompositeItem data-testid="2">2</CompositeItem>
          <CompositeItem data-testid="3">3</CompositeItem>
        </CompositeRoot>
      ));

      const item1 = getByTestId('1');
      const item3 = getByTestId('3');

      item1.focus();
      fireEvent.keyDown(item1, { key: 'End' });
      await flushMicrotasks();

      expect(item3).toHaveAttribute('tabindex', '0');
      expect(item3).toHaveFocus();
    });
  });

  describe('prop: disabledIndices', () => {
    it('moves the initial tab stop to the first enabled item when the default item is disabled', () => {
      const { getByTestId } = render(() => (
        <CompositeRoot disabledIndices={[0]}>
          <CompositeItem data-testid="1" />
          <CompositeItem data-testid="2" />
          <CompositeItem data-testid="3" />
        </CompositeRoot>
      ));

      expect(getByTestId('1')).toHaveAttribute('tabindex', '-1');
      expect(getByTestId('2')).toHaveAttribute('tabindex', '0');
      expect(getByTestId('3')).toHaveAttribute('tabindex', '-1');
    });

    it('skips disabled indices during arrow navigation', async () => {
      function App() {
        const [highlightedIndex, setHighlightedIndex] = createSignal(0);
        return (
          <CompositeRoot
            highlightedIndex={highlightedIndex()}
            onHighlightedIndexChange={setHighlightedIndex}
            disabledIndices={[1]}
          >
            <CompositeItem data-testid="1" />
            <CompositeItem data-testid="2" />
            <CompositeItem data-testid="3" />
          </CompositeRoot>
        );
      }

      const { getByTestId } = render(() => <App />);

      const item1 = getByTestId('1');
      const item3 = getByTestId('3');

      item1.focus();
      fireEvent.keyDown(item1, { key: 'ArrowDown' });
      await flushMicrotasks();

      expect(item3).toHaveAttribute('tabindex', '0');
      expect(item3).toHaveFocus();
    });
  });

  describe('prop: modifierKeys', () => {
    it('prevents arrow key navigation when any modifier key is pressed by default', async () => {
      const { getByTestId } = render(() => (
        <CompositeRoot>
          <CompositeItem data-testid="1">1</CompositeItem>
          <CompositeItem data-testid="2">2</CompositeItem>
        </CompositeRoot>
      ));

      const item1 = getByTestId('1');
      item1.focus();

      fireEvent.keyDown(item1, { key: 'ArrowDown', shiftKey: true });
      await flushMicrotasks();
      expect(item1).toHaveFocus();
    });

    it('allows navigation when the pressed modifier key is in the allow-list', async () => {
      const { getByTestId } = render(() => (
        <CompositeRoot modifierKeys={['Alt']}>
          <CompositeItem data-testid="1">1</CompositeItem>
          <CompositeItem data-testid="2">2</CompositeItem>
        </CompositeRoot>
      ));

      const item1 = getByTestId('1');
      const item2 = getByTestId('2');
      item1.focus();

      fireEvent.keyDown(item1, { key: 'ArrowDown', altKey: true });
      await flushMicrotasks();
      expect(item2).toHaveFocus();
    });
  });

  describe('rtl', () => {
    it('flips ArrowLeft/ArrowRight in horizontal orientation', async () => {
      const { getByTestId } = render(() => (
        <DirectionProvider direction="rtl">
          <CompositeRoot orientation="horizontal">
            <CompositeItem data-testid="1">1</CompositeItem>
            <CompositeItem data-testid="2">2</CompositeItem>
            <CompositeItem data-testid="3">3</CompositeItem>
          </CompositeRoot>
        </DirectionProvider>
      ));

      const item1 = getByTestId('1');
      const item2 = getByTestId('2');
      const item3 = getByTestId('3');

      item1.focus();

      // In RTL, ArrowLeft moves forward.
      fireEvent.keyDown(item1, { key: 'ArrowLeft' });
      await flushMicrotasks();
      expect(item2).toHaveAttribute('tabindex', '0');
      expect(item2).toHaveFocus();

      fireEvent.keyDown(item2, { key: 'ArrowLeft' });
      await flushMicrotasks();
      expect(item3).toHaveAttribute('tabindex', '0');
      expect(item3).toHaveFocus();

      // ArrowRight moves backward.
      fireEvent.keyDown(item3, { key: 'ArrowRight' });
      await flushMicrotasks();
      expect(item2).toHaveAttribute('tabindex', '0');
      expect(item2).toHaveFocus();
    });

    it('does not flip arrow keys without a DirectionProvider (defaults to ltr)', async () => {
      const { getByTestId } = render(() => (
        <CompositeRoot orientation="horizontal">
          <CompositeItem data-testid="1">1</CompositeItem>
          <CompositeItem data-testid="2">2</CompositeItem>
        </CompositeRoot>
      ));

      const item1 = getByTestId('1');
      item1.focus();

      fireEvent.keyDown(item1, { key: 'ArrowRight' });
      await flushMicrotasks();
      expect(getByTestId('2')).toHaveFocus();
    });
  });

  describe('grid', () => {
    it('navigates a uniform grid with arrow keys', async () => {
      const threeColsGrid = gridNavigation({ cols: 3 });
      const items = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

      const { getByTestId } = render(() => (
        <CompositeRoot grid={threeColsGrid} enableHomeAndEndKeys>
          {items.map((i) => (
            <CompositeItem data-testid={i}>{i}</CompositeItem>
          ))}
        </CompositeRoot>
      ));

      const item1 = getByTestId('1');
      item1.focus();

      fireEvent.keyDown(item1, { key: 'ArrowDown' });
      await flushMicrotasks();
      expect(getByTestId('4')).toHaveFocus();

      fireEvent.keyDown(getByTestId('4'), { key: 'ArrowRight' });
      await flushMicrotasks();
      expect(getByTestId('5')).toHaveFocus();

      fireEvent.keyDown(getByTestId('5'), { key: 'End' });
      await flushMicrotasks();
      expect(getByTestId('9')).toHaveAttribute('tabindex', '0');

      fireEvent.keyDown(getByTestId('9'), { key: 'Home' });
      await flushMicrotasks();
      expect(getByTestId('1')).toHaveAttribute('tabindex', '0');
    });
  });
});
