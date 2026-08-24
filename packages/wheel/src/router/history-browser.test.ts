// @vitest-environment jsdom
/**
 * `browserHistory` across router instances: one page can hold several
 * (nested `WheelProvider` trees each resolve their own `RouterHistoryService`),
 * and the address bar is global state. A write from one instance must reach
 * every OTHER instance's `listen` — and never echo back into its own, which
 * is the loop-prevention contract `RouterService` relies on.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { browserHistory } from './history';

describe('browserHistory across instances', () => {
  const unsubscribes: Array<() => void> = [];
  afterEach(() => {
    while (unsubscribes.length > 0) unsubscribes.pop()!();
    window.history.replaceState(null, '', '/');
  });

  function listening() {
    const history = browserHistory();
    const seen = vi.fn();
    unsubscribes.push(history.listen(seen));
    return { history, seen };
  }

  it('push reaches other instances but never echoes into its own listen', () => {
    const a = listening();
    const b = listening();

    a.history.push('/teams/t1');

    expect(b.seen).toHaveBeenCalledTimes(1);
    expect(b.seen).toHaveBeenCalledWith('/teams/t1');
    expect(a.seen).not.toHaveBeenCalled();
    expect(a.history.read()).toBe('/teams/t1');
    expect(b.history.read()).toBe('/teams/t1');
  });

  it('replace behaves the same as push for observers', () => {
    const a = listening();
    const b = listening();

    b.history.replace('/settings?tab=general');

    expect(a.seen).toHaveBeenCalledWith('/settings?tab=general');
    expect(b.seen).not.toHaveBeenCalled();
  });

  it('unsubscribe removes the write listener too', () => {
    const a = listening();
    const b = browserHistory();
    const seen = vi.fn();
    const unsubscribe = b.listen(seen);
    unsubscribe();

    a.history.push('/gone');

    expect(seen).not.toHaveBeenCalled();
  });
});
