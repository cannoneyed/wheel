// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@solidjs/testing-library';
import { ScrollArea } from '../index';

afterEach(cleanup);

describe('<ScrollArea.Corner />', () => {
  it('is absent when the scrollbar corner is hidden (default, no measured overflow)', () => {
    // `DEFAULT_HIDDEN_STATE` starts `{ x: true, y: true, corner: true }`, and jsdom never
    // measures real overflow to flip it, so the corner stays unrendered — matching upstream's
    // `if (hiddenState.corner) return null;` (ported here as `enabled: () => !hiddenState().corner`
    // per CONVENTIONS.md, which forbids early `return null`).
    const { queryByTestId } = render(() => (
      <ScrollArea.Root>
        <ScrollArea.Viewport>
          <div />
        </ScrollArea.Viewport>
        <ScrollArea.Corner data-testid="corner" />
      </ScrollArea.Root>
    ));

    expect(queryByTestId('corner')).toBe(null);
  });

  // Upstream's `describe.skipIf(isJSDOM)('interactions')` asserts `--scroll-area-corner-width/
  // height` resolve to real pixel values via `getComputedStyle`, which requires a real layout
  // engine (and a non-hidden corner, which itself requires real overflow measurement). Not
  // portable to jsdom; skipped per CONVENTIONS.md.
});
