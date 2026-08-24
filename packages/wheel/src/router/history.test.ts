import { describe, expect, it, vi } from 'vitest';

import { basedHistory, memoryHistory } from './history';

describe('memoryHistory', () => {
  it('starts at the last entry it was seeded with', () => {
    expect(memoryHistory(['/a', '/b']).read()).toBe('/b');
    expect(memoryHistory().read()).toBe('/');
  });

  it('normalizes entries to path + search + hash', () => {
    expect(memoryHistory(['teams/t1?q=x#top']).read()).toBe('/teams/t1?q=x#top');
  });

  it('push adds an entry; replace does not', () => {
    const history = memoryHistory(['/a']);
    history.push('/b');
    history.replace('/c');
    history.back();
    expect(history.read()).toBe('/a');
    history.forward();
    expect(history.read()).toBe('/c');
  });

  it('push truncates the forward stack', () => {
    const history = memoryHistory(['/a', '/b', '/c']);
    history.back();
    history.push('/d');
    history.forward();
    expect(history.read()).toBe('/d');
  });

  it('notifies listeners on back and forward, synchronously', () => {
    const history = memoryHistory(['/a', '/b']);
    const seen: string[] = [];
    const release = history.listen((url) => seen.push(url));
    history.back();
    history.forward();
    expect(seen).toEqual(['/a', '/b']);
    release();
    history.back();
    expect(seen).toEqual(['/a', '/b']);
  });

  it('does not notify for the router\'s own push or replace', () => {
    const history = memoryHistory(['/a']);
    const listener = vi.fn();
    history.listen(listener);
    history.push('/b');
    history.replace('/c');
    expect(listener).not.toHaveBeenCalled();
  });

  it('ignores back at the start and forward at the end', () => {
    const history = memoryHistory(['/a']);
    const listener = vi.fn();
    history.listen(listener);
    history.back();
    history.forward();
    expect(history.read()).toBe('/a');
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('basedHistory', () => {
  it('prepends the base on writes and strips it on reads', () => {
    const inner = memoryHistory(['/demos/todos']);
    const based = basedHistory(inner, '/demos/');
    expect(based.read()).toBe('/todos');
    based.push('/kanban?x=1#top');
    expect(inner.read()).toBe('/demos/kanban?x=1#top');
    expect(based.read()).toBe('/kanban?x=1#top');
    based.replace('/');
    expect(inner.read()).toBe('/demos/');
    expect(based.read()).toBe('/');
  });

  it('maps the bare base (with or without search) to the root path', () => {
    expect(basedHistory(memoryHistory(['/demos']), '/demos').read()).toBe('/');
    expect(basedHistory(memoryHistory(['/demos?q=x']), '/demos').read()).toBe('/?q=x');
  });

  it('does not strip a path that merely shares the base as a text prefix', () => {
    expect(basedHistory(memoryHistory(['/demosite']), '/demos').read()).toBe('/demosite');
  });

  it('is the identity for an empty or root base', () => {
    const inner = memoryHistory(['/a']);
    expect(basedHistory(inner, '/')).toBe(inner);
    expect(basedHistory(inner, '')).toBe(inner);
  });

  it('strips the base on listener notifications', () => {
    const inner = memoryHistory(['/demos/a', '/demos/b']);
    const based = basedHistory(inner, '/demos');
    const seen: string[] = [];
    const release = based.listen((url) => seen.push(url));
    based.back();
    based.forward();
    expect(seen).toEqual(['/a', '/b']);
    release();
  });
});

describe('basedHistory externalize', () => {
  it('prefixes hrefs so anchor URLs round-trip as cold-load entry points', () => {
    const based = basedHistory(memoryHistory(['/demos/a']), '/demos');
    expect(based.externalize!('/todos')).toBe('/demos/todos');
    expect(based.externalize!('/')).toBe('/demos/');
  });

  it('plain histories leave externalize undefined (identity at the call site)', () => {
    expect(memoryHistory().externalize).toBeUndefined();
  });
});
