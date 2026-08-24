// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@solidjs/testing-library';
import { TestCombobox } from '../test-utils';

afterEach(cleanup);

beforeEach(() => {
  globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
});

describe('<Combobox.List />', () => {
  it('sets role=listbox and aria-multiselectable in multiple mode', () => {
    render(() => <TestCombobox rootProps={{ multiple: true, defaultOpen: true }} />);
    const list = screen.getByTestId('list');
    expect(list).toHaveAttribute('role', 'listbox');
    expect(list).toHaveAttribute('aria-multiselectable', 'true');
  });

  it('sets role=grid when the root has grid enabled', () => {
    render(() => <TestCombobox rootProps={{ grid: true, defaultOpen: true }} />);
    expect(screen.getByTestId('list')).toHaveAttribute('role', 'grid');
  });

  it('renders every filtered item', () => {
    render(() => <TestCombobox rootProps={{ defaultOpen: true }} />);
    expect(screen.getByTestId('item-a')).toBeInTheDocument();
    expect(screen.getByTestId('item-b')).toBeInTheDocument();
    expect(screen.getByTestId('item-c')).toBeInTheDocument();
  });

  it('does not render items filtered out by the query', () => {
    render(() => <TestCombobox rootProps={{ defaultOpen: true, defaultInputValue: 'Ap' }} />);
    expect(screen.getByTestId('item-a')).toBeInTheDocument();
    expect(screen.queryByTestId('item-b')).not.toBeInTheDocument();
  });
});
