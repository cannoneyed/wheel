// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createSignal, For, Show, type JSX } from 'solid-js';
import { render, fireEvent, waitFor } from '@solidjs/testing-library';
import { mergePropsN } from '../../merge-props/mergeProps';
import type { HTMLProps } from '../../internals/types';
import { accessDisabledIndices } from '../utils/composite';
import { useFloating } from './useFloating';
import { useClick } from './useClick';
import { useListNavigation, type UseListNavigationProps } from './useListNavigation';
import { gridNavigation } from './gridNavigation';

/**
 * Resolves a mix of plain `HTMLProps` objects and zero-arg reactive thunks
 * (this hook's `reference`/`floating` return zero-arg thunks per the locked
 * "reactive attributes → thunk" convention, while `item`/`trigger` are plain
 * objects) and merges them the way a real consumer (a future
 * `useInteractions`-style combiner) would.
 */
function combineProps(...parts: Array<HTMLProps | (() => HTMLProps) | undefined>): HTMLProps {
  return mergePropsN(parts.map((part) => (typeof part === 'function' ? part() : part)));
}

function resolveDisabled(
  disabledIndices: ReadonlyArray<number> | ((index: number) => boolean) | undefined,
  index: number,
): boolean | undefined {
  if (disabledIndices == null) {
    return undefined;
  }
  return typeof disabledIndices === 'function' ? disabledIndices(index) : disabledIndices.includes(index);
}

type AppProps = Partial<UseListNavigationProps> & {
  disableFirstItem?: boolean;
  hideFirstItem?: boolean;
  firstItemStyle?: JSX.CSSProperties;
  onNavigateSpy?: (index: number | null) => void;
};

function App(inProps: AppProps = {}) {
  const [open, setOpen] = createSignal(false);
  const listRef: { current: Array<HTMLElement | null> } = { current: [] };
  const [activeIndex, setActiveIndex] = createSignal<number | null>(null);

  const floating = useFloating({
    open,
    onOpenChange: setOpen,
  });
  const click = useClick(floating.context);
  const navigation = useListNavigation(floating.context, {
    ...inProps,
    listRef,
    activeIndex,
    onNavigate(index) {
      setActiveIndex(index);
      inProps.onNavigateSpy?.(index);
    },
  });

  return (
    <>
      <button
        data-testid="reference"
        ref={floating.refs.setReference}
        {...combineProps(click.reference, navigation.reference)}
      />
      <Show when={open()}>
        <div role="menu" ref={floating.refs.setFloating} {...navigation.floating()}>
          <ul>
            <For each={['one', 'two', 'three']}>
              {(text, index) => (
                <li
                  data-testid={`item-${index()}`}
                  aria-selected={activeIndex() === index()}
                  tabIndex={-1}
                  aria-disabled={
                    inProps.disableFirstItem && index() === 0
                      ? true
                      : resolveDisabled(accessDisabledIndices(inProps.disabledIndices), index())
                  }
                  style={
                    inProps.hideFirstItem && index() === 0
                      ? { display: 'none' }
                      : index() === 0
                        ? inProps.firstItemStyle
                        : undefined
                  }
                  ref={(el) => {
                    listRef.current[index()] = el;
                  }}
                  {...navigation.item}
                >
                  {text}
                </li>
              )}
            </For>
          </ul>
        </div>
      </Show>
    </>
  );
}

describe('useListNavigation', () => {
  it('opens on ArrowDown and focuses first item', async () => {
    const { getByRole, getByTestId } = render(() => <App />);

    fireEvent.keyDown(getByRole('button'), { key: 'ArrowDown' });
    expect(getByRole('menu')).toBeInTheDocument();
    await waitFor(() => {
      expect(getByTestId('item-0')).toHaveFocus();
    });
  });

  it('opens on ArrowUp and focuses last item', async () => {
    const { getByRole, getByTestId } = render(() => <App />);

    fireEvent.keyDown(getByRole('button'), { key: 'ArrowUp' });
    expect(getByRole('menu')).toBeInTheDocument();
    await waitFor(() => {
      expect(getByTestId('item-2')).toHaveFocus();
    });
  });

  it('navigates down on ArrowDown and stops at the end', async () => {
    const { getByRole, getByTestId } = render(() => <App />);

    fireEvent.keyDown(getByRole('button'), { key: 'ArrowDown' });
    await waitFor(() => expect(getByTestId('item-0')).toHaveFocus());

    fireEvent.keyDown(getByRole('menu'), { key: 'ArrowDown' });
    await waitFor(() => expect(getByTestId('item-1')).toHaveFocus());

    fireEvent.keyDown(getByRole('menu'), { key: 'ArrowDown' });
    await waitFor(() => expect(getByTestId('item-2')).toHaveFocus());

    // Reached the end of the list.
    fireEvent.keyDown(getByRole('menu'), { key: 'ArrowDown' });
    await waitFor(() => expect(getByTestId('item-2')).toHaveFocus());
  });

  it('navigates up on ArrowUp and stops at the start', async () => {
    const { getByRole, getByTestId } = render(() => <App />);

    fireEvent.keyDown(getByRole('button'), { key: 'ArrowUp' });
    await waitFor(() => expect(getByTestId('item-2')).toHaveFocus());

    fireEvent.keyDown(getByRole('menu'), { key: 'ArrowUp' });
    await waitFor(() => expect(getByTestId('item-1')).toHaveFocus());

    fireEvent.keyDown(getByRole('menu'), { key: 'ArrowUp' });
    await waitFor(() => expect(getByTestId('item-0')).toHaveFocus());

    fireEvent.keyDown(getByRole('menu'), { key: 'ArrowUp' });
    await waitFor(() => expect(getByTestId('item-0')).toHaveFocus());
  });

  it('skips a disabled item on initial navigation', async () => {
    const { getByRole, getByTestId } = render(() => (
      <App disableFirstItem loopFocus={() => true} disabledIndices={[]} />
    ));

    fireEvent.keyDown(getByRole('button'), { key: 'ArrowDown' });
    await waitFor(() => expect(getByTestId('item-1')).toHaveFocus());

    fireEvent.keyDown(getByRole('menu'), { key: 'ArrowUp' });
    await waitFor(() => expect(getByTestId('item-0')).toHaveFocus());
  });

  it('skips items hidden with CSS in navigation', async () => {
    const { getByRole, getByTestId } = render(() => (
      <App hideFirstItem loopFocus={() => true} disabledIndices={[]} />
    ));

    fireEvent.keyDown(getByRole('button'), { key: 'ArrowDown' });
    await waitFor(() => expect(getByTestId('item-1')).toHaveFocus());

    fireEvent.keyDown(getByRole('menu'), { key: 'ArrowUp' });
    await waitFor(() => expect(getByTestId('item-2')).toHaveFocus());
  });

  describe('prop: loopFocus', () => {
    it('ArrowDown loops back to the first item', async () => {
      const { getByRole, getByTestId } = render(() => <App loopFocus={() => true} />);

      fireEvent.keyDown(getByRole('button'), { key: 'ArrowDown' });
      await waitFor(() => expect(getByTestId('item-0')).toHaveFocus());
      fireEvent.keyDown(getByRole('menu'), { key: 'ArrowDown' });
      await waitFor(() => expect(getByTestId('item-1')).toHaveFocus());
      fireEvent.keyDown(getByRole('menu'), { key: 'ArrowDown' });
      await waitFor(() => expect(getByTestId('item-2')).toHaveFocus());
      fireEvent.keyDown(getByRole('menu'), { key: 'ArrowDown' });
      await waitFor(() => expect(getByTestId('item-0')).toHaveFocus());
    });

    it('ArrowUp loops back to the last item', async () => {
      const { getByRole, getByTestId } = render(() => <App loopFocus={() => true} />);

      fireEvent.keyDown(getByRole('button'), { key: 'ArrowUp' });
      await waitFor(() => expect(getByTestId('item-2')).toHaveFocus());
      fireEvent.keyDown(getByRole('menu'), { key: 'ArrowUp' });
      await waitFor(() => expect(getByTestId('item-1')).toHaveFocus());
      fireEvent.keyDown(getByRole('menu'), { key: 'ArrowUp' });
      await waitFor(() => expect(getByTestId('item-0')).toHaveFocus());
      fireEvent.keyDown(getByRole('menu'), { key: 'ArrowUp' });
      await waitFor(() => expect(getByTestId('item-2')).toHaveFocus());
    });
  });

  describe('prop: orientation', () => {
    it('navigates with ArrowRight/ArrowLeft when horizontal', async () => {
      const { getByRole, getByTestId } = render(() => <App orientation={() => 'horizontal'} />);

      fireEvent.keyDown(getByRole('button'), { key: 'ArrowRight' });
      await waitFor(() => expect(getByTestId('item-0')).toHaveFocus());
      fireEvent.keyDown(getByRole('menu'), { key: 'ArrowRight' });
      await waitFor(() => expect(getByTestId('item-1')).toHaveFocus());
      fireEvent.keyDown(getByRole('menu'), { key: 'ArrowLeft' });
      await waitFor(() => expect(getByTestId('item-0')).toHaveFocus());
    });
  });

  describe('prop: rtl', () => {
    it('flips ArrowLeft/ArrowRight direction', async () => {
      const { getByRole, getByTestId } = render(() => (
        <App rtl={() => true} orientation={() => 'horizontal'} />
      ));

      fireEvent.keyDown(getByRole('button'), { key: 'ArrowLeft' });
      await waitFor(() => expect(getByTestId('item-0')).toHaveFocus());
      fireEvent.keyDown(getByRole('menu'), { key: 'ArrowLeft' });
      await waitFor(() => expect(getByTestId('item-1')).toHaveFocus());
      fireEvent.keyDown(getByRole('menu'), { key: 'ArrowRight' });
      await waitFor(() => expect(getByTestId('item-0')).toHaveFocus());
    });
  });

  describe('prop: openOnArrowKeyDown', () => {
    it('does not open on ArrowDown when false', () => {
      const { getByRole, queryByRole } = render(() => (
        <App openOnArrowKeyDown={() => false} />
      ));
      fireEvent.keyDown(getByRole('button'), { key: 'ArrowDown' });
      expect(queryByRole('menu')).not.toBeInTheDocument();
    });

    it('opens on ArrowDown when true (default)', () => {
      const { getByRole } = render(() => <App />);
      fireEvent.keyDown(getByRole('button'), { key: 'ArrowDown' });
      expect(getByRole('menu')).toBeInTheDocument();
    });
  });

  describe('prop: disabledIndices', () => {
    it('skips explicitly disabled indices in both directions', async () => {
      const { getByRole, getByTestId } = render(() => <App disabledIndices={() => [0]} />);

      fireEvent.keyDown(getByRole('button'), { key: 'ArrowDown' });
      await waitFor(() => expect(getByTestId('item-1')).toHaveFocus());

      fireEvent.keyDown(getByRole('menu'), { key: 'ArrowUp' });
      await waitFor(() => expect(getByTestId('item-1')).toHaveFocus());
    });
  });

  describe('prop: focusItemOnOpen', () => {
    it('focuses the first item on click when true', async () => {
      const { getByRole, getByTestId } = render(() => <App focusItemOnOpen={() => true} />);
      fireEvent.click(getByRole('button'));
      await waitFor(() => {
        expect(getByTestId('item-0')).toHaveFocus();
      });
    });

    it('does not focus the first item on click when false', async () => {
      const { getByRole, getByTestId } = render(() => <App focusItemOnOpen={() => false} />);
      fireEvent.click(getByRole('button'));
      await waitFor(() => {
        expect(getByTestId('item-0')).not.toHaveFocus();
      });
    });
  });

  describe('Home/End keys', () => {
    it('Home focuses the first item and End focuses the last', async () => {
      const { getByRole, getByTestId } = render(() => <App />);

      fireEvent.keyDown(getByRole('button'), { key: 'ArrowDown' });
      await waitFor(() => expect(getByTestId('item-0')).toHaveFocus());

      fireEvent.keyDown(getByRole('menu'), { key: 'End' });
      await waitFor(() => expect(getByTestId('item-2')).toHaveFocus());

      fireEvent.keyDown(getByRole('menu'), { key: 'Home' });
      await waitFor(() => expect(getByTestId('item-0')).toHaveFocus());
    });
  });

  describe('virtual mode', () => {
    it('sets aria-activedescendant instead of moving DOM focus', () => {
      const { getByRole } = render(() => <App virtual={() => true} id={() => 'list'} />);

      const button = getByRole('button');
      // Virtual mode keeps DOM focus on the reference — focus it first, the
      // way a real user (or `useFocus`) would before navigating.
      button.focus();
      fireEvent.keyDown(button, { key: 'ArrowDown' });

      expect(getByRole('menu')).toBeInTheDocument();
      expect(button).toHaveAttribute('aria-activedescendant', 'list-0');
      // Focus stays on the reference in virtual mode.
      expect(button).toHaveFocus();
    });

    it('advances aria-activedescendant on further ArrowDown presses', () => {
      const { getByRole } = render(() => <App virtual={() => true} id={() => 'list'} />);

      const button = getByRole('button');
      button.focus();
      fireEvent.keyDown(button, { key: 'ArrowDown' });
      expect(button).toHaveAttribute('aria-activedescendant', 'list-0');

      fireEvent.keyDown(button, { key: 'ArrowDown' });
      expect(button).toHaveAttribute('aria-activedescendant', 'list-1');
    });

    describe('allowEscape', () => {
      it('escapes past the first item when true', () => {
        const { getByRole, getByTestId } = render(() => (
          <App allowEscape={() => true} virtual={() => true} loopFocus={() => true} />
        ));

        fireEvent.keyDown(getByRole('button'), { key: 'ArrowDown' });
        expect(getByTestId('item-0')).toHaveAttribute('aria-selected', 'true');

        fireEvent.keyDown(getByRole('button'), { key: 'ArrowUp' });
        expect(getByTestId('item-0')).toHaveAttribute('aria-selected', 'false');
      });

      it('does not escape when false', () => {
        const { getByRole, getByTestId } = render(() => (
          <App allowEscape={() => false} virtual={() => true} loopFocus={() => true} />
        ));

        fireEvent.keyDown(getByRole('button'), { key: 'ArrowDown' });
        expect(getByTestId('item-0')).toHaveAttribute('aria-selected', 'true');

        fireEvent.keyDown(getByRole('button'), { key: 'ArrowDown' });
        expect(getByTestId('item-1')).toHaveAttribute('aria-selected', 'true');
      });
    });
  });

  describe('prop: focusItemOnHover', () => {
    it('focuses an item on hover and syncs the active index', async () => {
      const spy = vi.fn();
      const { getByRole, getByTestId } = render(() => <App onNavigateSpy={spy} />);
      fireEvent.click(getByRole('button'));
      fireEvent.mouseMove(getByTestId('item-1'));
      await waitFor(() => {
        expect(getByTestId('item-1')).toHaveFocus();
      });
      expect(spy.mock.calls.some((args) => args[0] === 1)).toBe(true);
    });

    it('does not focus on hover when false', async () => {
      const spy = vi.fn();
      const { getByRole, getByTestId } = render(() => (
        <App onNavigateSpy={spy} focusItemOnOpen={() => false} focusItemOnHover={() => false} />
      ));
      fireEvent.click(getByRole('button'));
      fireEvent.mouseMove(getByTestId('item-1'));
      expect(getByTestId('item-1')).not.toHaveFocus();
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('grid navigation', () => {
    function Grid(gridProps: { loopFocus?: boolean } = {}) {
      const [open, setOpen] = createSignal(true);
      const listRef: { current: Array<HTMLElement | null> } = { current: [] };
      const [activeIndex, setActiveIndex] = createSignal<number | null>(null);
      const floating = useFloating({ open, onOpenChange: setOpen });
      const navigation = useListNavigation(floating.context, {
        listRef,
        activeIndex,
        onNavigate: setActiveIndex,
        orientation: () => 'both',
        loopFocus: () => gridProps.loopFocus ?? false,
        grid: gridNavigation,
      });

      return (
        <div
          role="grid"
          data-testid="floating"
          ref={floating.refs.setFloating}
          {...navigation.floating()}
        >
          <For each={[0, 1, 2, 3]}>
            {(index) => (
              <button
                type="button"
                role="gridcell"
                data-testid={`cell-${index}`}
                ref={(el) => {
                  listRef.current[index] = el;
                }}
                {...navigation.item}
              >
                {index}
              </button>
            )}
          </For>
        </div>
      );
    }

    it('ArrowRight/ArrowDown move across a 2-column grid', () => {
      const { getByTestId } = render(() => <Grid />);
      const floatingEl = getByTestId('floating');

      getByTestId('cell-0').focus();
      fireEvent.keyDown(floatingEl, { key: 'ArrowRight' });
      expect(getByTestId('cell-1')).toHaveFocus();

      fireEvent.keyDown(floatingEl, { key: 'ArrowDown' });
      expect(getByTestId('cell-3')).toHaveFocus();
    });

    it('loops within a column when loopFocus is set', () => {
      const { getByTestId } = render(() => <Grid loopFocus />);
      const floatingEl = getByTestId('floating');

      getByTestId('cell-0').focus();
      fireEvent.keyDown(floatingEl, { key: 'ArrowUp' });
      expect(getByTestId('cell-2')).toHaveFocus();
    });
  });

  describe('prop: nested', () => {
    function NestedApp() {
      const [open, setOpen] = createSignal(false);
      const listRef: { current: Array<HTMLElement | null> } = { current: [] };
      const [activeIndex, setActiveIndex] = createSignal<number | null>(null);
      const floating = useFloating({ open, onOpenChange: setOpen });
      const navigation = useListNavigation(floating.context, {
        listRef,
        activeIndex,
        onNavigate: setActiveIndex,
        nested: () => true,
      });

      return (
        <>
          <div
            data-testid="reference"
            tabIndex={0}
            ref={floating.refs.setReference}
            {...navigation.reference()}
          />
          <Show when={open()}>
            <div
              role="menu"
              data-testid="floating"
              tabIndex={-1}
              ref={floating.refs.setFloating}
              {...navigation.floating()}
            >
              <For each={['a', 'b']}>
                {(text, index) => (
                  <div
                    data-testid={`item-${index()}`}
                    tabIndex={-1}
                    ref={(el) => {
                      listRef.current[index()] = el;
                    }}
                    {...navigation.item}
                  >
                    {text}
                  </div>
                )}
              </For>
            </div>
          </Show>
        </>
      );
    }

    it('opens on the parent orientation key (ArrowRight) while closed', () => {
      const { getByTestId } = render(() => <NestedApp />);
      fireEvent.keyDown(getByTestId('reference'), { key: 'ArrowRight' });
      expect(getByTestId('floating')).toBeInTheDocument();
    });

    it('closes and refocuses the reference on the close key (ArrowLeft)', async () => {
      const { getByTestId, queryByTestId } = render(() => <NestedApp />);
      fireEvent.keyDown(getByTestId('reference'), { key: 'ArrowRight' });
      expect(getByTestId('floating')).toBeInTheDocument();

      fireEvent.keyDown(getByTestId('floating'), { key: 'ArrowLeft' });
      await waitFor(() => {
        expect(queryByTestId('floating')).not.toBeInTheDocument();
      });
      expect(getByTestId('reference')).toHaveFocus();
    });
  });
});
