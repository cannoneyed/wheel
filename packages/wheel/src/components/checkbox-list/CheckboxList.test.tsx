// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { createSignal } from 'solid-js';
import { CheckboxList, CheckboxListItem } from './index';

describe('<CheckboxList />', () => {
  it('names and describes its nested group', () => {
    const { getByRole, getByText } = render(() => (
      <CheckboxList
        label="Notifications"
        description="Choose delivery channels"
        status="error"
        statusMessage="Choose one channel"
      >
        <CheckboxListItem value="email" label="Email" />
      </CheckboxList>
    ));

    const group = getByRole('group', { name: 'Notifications' });
    const describedBy = group.getAttribute('aria-describedby')!.split(' ');
    expect(describedBy).toContain(getByText('Choose delivery channels').id);
    expect(describedBy).toContain(getByText('Choose one channel').id);
    expect(group).toHaveAttribute('aria-invalid', 'true');
  });

  it('updates uncontrolled collection state from row clicks', async () => {
    const user = userEvent.setup();
    const { getByRole } = render(() => (
      <CheckboxList label="Notifications" defaultValue={['email']}>
        <CheckboxListItem value="email" label="Email" />
        <CheckboxListItem value="push" label="Push" />
      </CheckboxList>
    ));

    const email = getByRole('checkbox', { name: 'Email' });
    const push = getByRole('checkbox', { name: 'Push' });
    expect(email).toHaveAttribute('aria-checked', 'true');
    expect(push).toHaveAttribute('aria-checked', 'false');

    await user.click(getByTextLabel(push));
    expect(push).toHaveAttribute('aria-checked', 'true');
    await user.click(getByTextLabel(email));
    expect(email).toHaveAttribute('aria-checked', 'false');
  });

  it('supports a controlled value array', async () => {
    const user = userEvent.setup();
    const [value, setValue] = createSignal<string[]>([]);
    const { getByRole } = render(() => (
      <CheckboxList label="Notifications" value={value()} onValueChange={setValue}>
        <CheckboxListItem value="email" label="Email" />
      </CheckboxList>
    ));

    const checkbox = getByRole('checkbox', { name: 'Email' });
    await user.click(checkbox);
    expect(value()).toEqual(['email']);
    expect(checkbox).toHaveAttribute('aria-checked', 'true');
  });

  it('exposes density, orientation, dividers, and inherited state', () => {
    const { getByTestId, getByRole } = render(() => (
      <CheckboxList
        data-testid="list"
        label="Options"
        density="spacious"
        hasDividers
        orientation="horizontal"
        readOnly
        size="sm"
        status="success"
      >
        <CheckboxListItem value="one" label="One" data-testid="item" />
      </CheckboxList>
    ));

    const list = getByTestId('list');
    expect(list).toHaveAttribute('data-density', 'spacious');
    expect(list).toHaveAttribute('data-has-dividers', '');
    expect(list).toHaveAttribute('data-orientation', 'horizontal');
    expect(getByTestId('item')).toHaveAttribute('data-readonly', '');
    expect(getByRole('checkbox', { name: 'One' })).toHaveAttribute('data-size', 'sm');
    expect(getByRole('checkbox', { name: 'One' })).toHaveAttribute('data-status', 'success');
  });
});

describe('<CheckboxListItem />', () => {
  it('renders a named standalone Checkbox with description and end content', () => {
    const { getByRole, getByText } = render(() => (
      <CheckboxListItem
        label="Email"
        description="Weekly digest"
        endContent="Recommended"
        defaultChecked
      />
    ));

    const checkbox = getByRole('checkbox', { name: 'Email' });
    expect(checkbox).toHaveAttribute('aria-checked', 'true');
    expect(checkbox).toHaveAttribute('aria-describedby', getByText('Weekly digest').id);
    expect(getByText('Recommended')).toBeVisible();
  });

  it('shows mixed, disabled, and read-only states', () => {
    const { getByRole, getByTestId } = render(() => (
      <>
        <CheckboxListItem label="Mixed" indeterminate data-testid="mixed" />
        <CheckboxListItem label="Disabled" disabled data-testid="disabled" />
        <CheckboxListItem label="Read only" readOnly data-testid="readonly" />
      </>
    ));

    expect(getByRole('checkbox', { name: 'Mixed' })).toHaveAttribute('aria-checked', 'mixed');
    expect(getByTestId('disabled')).toHaveAttribute('data-disabled', '');
    expect(getByTestId('readonly')).toHaveAttribute('data-readonly', '');
  });
});

function getByTextLabel(checkbox: HTMLElement): HTMLLabelElement {
  const label = checkbox.closest('label');
  if (!(label instanceof HTMLLabelElement)) {
    throw new Error('Checkbox List Item did not render a label.');
  }
  return label;
}
