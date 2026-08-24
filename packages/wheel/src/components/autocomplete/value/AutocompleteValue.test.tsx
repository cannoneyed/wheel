// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@solidjs/testing-library';
import { Autocomplete } from '../index';

afterEach(cleanup);

beforeEach(() => {
  globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
});

describe('<Autocomplete.Value />', () => {
  describe('prop: children', () => {
    it('renders current input value via function child', () => {
      render(() => (
        <Autocomplete.Root defaultValue="hel">
          <Autocomplete.Trigger>
            <Autocomplete.Value>{(val) => <div data-testid="value">{val}</div>}</Autocomplete.Value>
          </Autocomplete.Trigger>
          <Autocomplete.Portal>
            <Autocomplete.Positioner>
              <Autocomplete.Popup>
                <Autocomplete.List>
                  <Autocomplete.Item value="hello">hello</Autocomplete.Item>
                  <Autocomplete.Item value="help">help</Autocomplete.Item>
                </Autocomplete.List>
              </Autocomplete.Popup>
            </Autocomplete.Positioner>
          </Autocomplete.Portal>
        </Autocomplete.Root>
      ));

      expect(screen.getByTestId('value')).toHaveTextContent('hel');
    });

    it('renders function child with empty string when no value typed', () => {
      render(() => (
        <Autocomplete.Root>
          <Autocomplete.Value>
            {(val) => <div data-testid="value">{val === '' ? 'empty' : String(val)}</div>}
          </Autocomplete.Value>
          <Autocomplete.Portal>
            <Autocomplete.Positioner>
              <Autocomplete.Popup>
                <Autocomplete.List>
                  <Autocomplete.Item value="a">a</Autocomplete.Item>
                </Autocomplete.List>
              </Autocomplete.Popup>
            </Autocomplete.Positioner>
          </Autocomplete.Portal>
        </Autocomplete.Root>
      ));

      expect(screen.getByTestId('value')).toHaveTextContent('empty');
    });

    it('overrides the display when children is static JSX', () => {
      render(() => (
        <Autocomplete.Root defaultValue="test-value">
          <Autocomplete.Value>Custom Display Text</Autocomplete.Value>
          <Autocomplete.Portal>
            <Autocomplete.Positioner>
              <Autocomplete.Popup>
                <Autocomplete.List>
                  <Autocomplete.Item value="test-value">Test</Autocomplete.Item>
                </Autocomplete.List>
              </Autocomplete.Popup>
            </Autocomplete.Positioner>
          </Autocomplete.Portal>
        </Autocomplete.Root>
      ));

      expect(screen.getByText('Custom Display Text')).not.toBe(null);
    });

    it('renders complex JSX children', () => {
      render(() => (
        <Autocomplete.Root defaultValue="test">
          <Autocomplete.Value>
            <span data-testid="complex">
              <strong>Bold</strong> and <em>italic</em> text
            </span>
          </Autocomplete.Value>
          <Autocomplete.Portal>
            <Autocomplete.Positioner>
              <Autocomplete.Popup>
                <Autocomplete.List>
                  <Autocomplete.Item value="test">Test</Autocomplete.Item>
                </Autocomplete.List>
              </Autocomplete.Popup>
            </Autocomplete.Positioner>
          </Autocomplete.Portal>
        </Autocomplete.Root>
      ));

      const element = screen.getByTestId('complex');
      expect(element.querySelector('strong')).toHaveTextContent('Bold');
      expect(element.querySelector('em')).toHaveTextContent('italic');
    });
  });
});
