import { cleanup, render } from '@solidjs/testing-library';
import type { Component } from 'solid-js';
import { afterEach, describe, expect, it } from 'vitest';

import * as Astryx from './AstryxComponents';
import type { AstryxComponentProps } from './AstryxComponents';

afterEach(cleanup);

describe('generated Astryx components', () => {
  it('exports and renders every Astryx-only component through the shared design contract', () => {
    const components = Object.entries(Astryx).filter((entry): entry is [string, Component<AstryxComponentProps>] =>
      typeof entry[1] === 'function'
    );

    expect(components).toHaveLength(112);
    for (const [name, GeneratedComponent] of components) {
      const result = render(() => (
        <GeneratedComponent
          as="div"
          size="lg"
          tone="warning"
          density="spacious"
          orientation="horizontal"
          variant="reference"
        >
          {name}
        </GeneratedComponent>
      ));
      const element = result.container.firstElementChild;
      expect(element).toHaveAttribute('data-component', name);
      expect(element).toHaveAttribute('data-size', 'lg');
      expect(element).toHaveAttribute('data-tone', 'warning');
      expect(element).toHaveAttribute('data-density', 'spacious');
      expect(element).toHaveAttribute('data-orientation', 'horizontal');
      expect(element).toHaveAttribute('data-variant', 'reference');
      result.unmount();
    }
  });

  it('exposes disabled state without hiding content', () => {
    const { getByText } = render(() => <Astryx.Badge disabled>Queued</Astryx.Badge>);
    expect(getByText('Queued')).toHaveAttribute('aria-disabled', 'true');
    expect(getByText('Queued')).toHaveAttribute('data-disabled');
  });
});
