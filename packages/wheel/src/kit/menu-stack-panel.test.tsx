// @vitest-environment jsdom
import { render } from 'solid-js/web';
import { describe, expect, it } from 'vitest';

import { createMenuStack } from './menu-stack';
import { MenuStackPanel } from './menu-stack-panel';

describe('MenuStackPanel', () => {
  it('keeps the frame fixed while rows scroll and lets callers render icons', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const stack = createMenuStack({
      title: '',
      items: [{ id: 'docs', label: 'Documents', icon: 'document', run: () => {} }]
    });
    const dispose = render(
      () => (
        <MenuStackPanel
          stack={stack}
          state={stack.state}
          maxHeight="100px"
          renderIcon={(icon) => <i data-icon={icon} />}
        />
      ),
      host
    );

    const panel = host.querySelector<HTMLElement>('[data-testid="wheel-menu-stack"]')!;
    const items = host.querySelector<HTMLElement>('[data-testid="wheel-menu-items"]')!;
    expect(panel.style.maxHeight).toBe('100px');
    expect(panel.style.overflow).toBe('hidden');
    expect(items.style.overflowY).toBe('auto');
    expect(items.querySelector('[data-icon="document"]')).not.toBeNull();

    dispose();
    host.remove();
  });
});
