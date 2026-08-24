// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@solidjs/testing-library';
import { Accordion } from '../index';

describe('<Accordion.Header />', () => {
  it('renders an h3 with role heading', () => {
    const { getByRole } = render(() => (
      <Accordion.Root>
        <Accordion.Item>
          <Accordion.Header>
            <Accordion.Trigger>Trigger</Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Panel>Panel</Accordion.Panel>
        </Accordion.Item>
      </Accordion.Root>
    ));

    const heading = getByRole('heading');
    expect(heading.tagName).toBe('H3');
  });

  it('supports the `as` prop to change the rendered tag', () => {
    const { getByRole } = render(() => (
      <Accordion.Root>
        <Accordion.Item>
          <Accordion.Header as="h2">
            <Accordion.Trigger>Trigger</Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Panel>Panel</Accordion.Panel>
        </Accordion.Item>
      </Accordion.Root>
    ));

    expect(getByRole('heading').tagName).toBe('H2');
  });

  it('reflects the item disabled/open state as data attributes', async () => {
    const { getByRole } = render(() => (
      <Accordion.Root defaultValue={[0]}>
        <Accordion.Item value={0} disabled>
          <Accordion.Header>
            <Accordion.Trigger>Trigger</Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Panel>Panel</Accordion.Panel>
        </Accordion.Item>
      </Accordion.Root>
    ));

    const heading = getByRole('heading');
    expect(heading).toHaveAttribute('data-disabled');
    expect(heading).toHaveAttribute('data-open');
  });
});
