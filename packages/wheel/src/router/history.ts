/**
 * THE ONLY module in the router allowed to touch `window.location` and
 * `window.history`.
 *
 * Same doctrine as `core/runtime-defaults.ts` does for time and randomness:
 * the real thing lives behind one narrow interface, everything else takes it by
 * injection, and tests get a deterministic implementation instead of a global.
 * The `no-raw-location` lint rule enforces the boundary — this file is its only
 * exemption.
 *
 *   browserHistory()             // production: real URL bar, real back button
 *   memoryHistory(['/teams/a'])  // tests: an array and an index, fully synchronous
 *
 * `memoryHistory` notifies listeners synchronously on `back()`/`forward()`.
 * The browser does not (it fires `popstate` on a later task), so a test that
 * needs real browser timing belongs in the Playwright suite, not a unit test.
 */

/** A location as the router handles it: path, search, and hash — never the origin. */
export type HistoryUrl = string;

/** The seam between the router and the address bar. */
export interface RouterHistory {
  /** The current path + search + hash. */
  read(): HistoryUrl;
  /** Navigate, adding a history entry. */
  push(url: HistoryUrl): void;
  /** Navigate, replacing the current history entry. */
  replace(url: HistoryUrl): void;
  /** Move back one entry, if there is one. */
  back(): void;
  /** Move forward one entry, if there is one. */
  forward(): void;
  /** Subscribe to entries the USER moved to (back/forward). Returns an unsubscribe. */
  listen(callback: (url: HistoryUrl) => void): () => void;
  /**
   * Turn a router-internal url into the one the BROWSER should see — what
   * `<Link>` writes into `href`. Absent means identity; `basedHistory`
   * prepends its mount prefix so cmd-click, middle-click, and "copy link
   * address" stay inside the mounted app.
   */
  externalize?(url: HistoryUrl): string;
}

/** Normalize any input to a leading-slash path + search + hash. */
function normalize(url: string): HistoryUrl {
  const parsed = new URL(url, 'http://wheel.invalid');
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

/**
 * `browserHistory` instances announce their own `push`/`replace` writes on
 * this window-level event, because `pushState` fires no event of its own.
 * One page can hold several router instances (nested `WheelProvider` trees
 * each resolve their own `RouterHistoryService`), and the address bar is
 * global state — every instance must observe every write to it, or a
 * navigation from one tree changes the URL while the others keep rendering
 * the old route.
 */
const WRITE_EVENT = 'wheel:history-write';

/**
 * The real thing: `history.pushState` for navigation, `popstate` for the back
 * and forward buttons, and a window-level write event for navigations made by
 * OTHER router instances on the same page.
 *
 * The writing instance skips its own announcement (`writing` is set around the
 * synchronous dispatch), so a router's navigations never echo back through its
 * own `listen` — which is what keeps its URL atom from looping. `popstate`
 * needs no such guard: the browser fires it only for user navigation.
 */
export function browserHistory(): RouterHistory {
  const current = (): HistoryUrl =>
    `${window.location.pathname}${window.location.search}${window.location.hash}`;
  let writing = false;
  const announce = (): void => {
    writing = true;
    try {
      window.dispatchEvent(new Event(WRITE_EVENT));
    } finally {
      writing = false;
    }
  };
  return {
    read: current,
    push(url) {
      window.history.pushState(null, '', normalize(url));
      announce();
    },
    replace(url) {
      window.history.replaceState(null, '', normalize(url));
      announce();
    },
    back: () => window.history.back(),
    forward: () => window.history.forward(),
    listen(callback) {
      const onPopState = (): void => callback(current());
      const onWrite = (): void => {
        if (!writing) callback(current());
      };
      window.addEventListener('popstate', onPopState);
      window.addEventListener(WRITE_EVENT, onWrite);
      return () => {
        window.removeEventListener('popstate', onPopState);
        window.removeEventListener(WRITE_EVENT, onWrite);
      };
    }
  };
}

/**
 * An array and an index. Everything is synchronous, so a test can navigate,
 * go back, and assert in straight-line code with no waiting.
 */
export function memoryHistory(entries: readonly string[] = ['/']): RouterHistory {
  const stack: HistoryUrl[] = entries.length > 0 ? entries.map(normalize) : ['/'];
  let index = stack.length - 1;
  const listeners = new Set<(url: HistoryUrl) => void>();
  const notify = (): void => {
    for (const listener of [...listeners]) listener(stack[index]);
  };
  return {
    read: () => stack[index],
    push(url) {
      stack.splice(index + 1);
      stack.push(normalize(url));
      index = stack.length - 1;
    },
    replace(url) {
      stack[index] = normalize(url);
    },
    back() {
      if (index === 0) return;
      index -= 1;
      notify();
    },
    forward() {
      if (index >= stack.length - 1) return;
      index += 1;
      notify();
    },
    listen(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    }
  };
}

/**
 * Browser history when there is a `window`, memory history otherwise.
 *
 * The fallback is what lets a router-connected service instantiate under
 * Node (unit tests, SSR) without a `window` guard at every call site.
 */
export function defaultHistory(): RouterHistory {
  return typeof window === 'undefined' || typeof window.history === 'undefined'
    ? memoryHistory()
    : browserHistory();
}

/**
 * Mount an app under a path prefix (e.g. the demos app served at `/demos/`
 * inside wheel.dev) without the route table knowing: the router keeps matching
 * `/todos`, while the address bar shows `/demos/todos`.
 *
 * Reads strip the base; writes prepend it. A read of a path OUTSIDE the base
 * passes through unchanged — the route table then treats it as not-found
 * rather than mis-matching a stripped fragment.
 */
export function basedHistory(inner: RouterHistory, base: string): RouterHistory {
  const prefix = normalize(base).replace(/\/+$/, '');
  if (prefix === '') {
    return inner;
  }
  const strip = (url: HistoryUrl): HistoryUrl => {
    if (url === prefix) return '/';
    if (url.startsWith(prefix)) {
      const rest = url.slice(prefix.length);
      // Boundary check: `/demos/todos` strips, `/demosite` must not.
      if (rest.startsWith('/')) return rest;
      if (rest.startsWith('?') || rest.startsWith('#')) return `/${rest}`;
    }
    return url;
  };
  const prepend = (url: HistoryUrl): HistoryUrl => `${prefix}${normalize(url)}`;
  return {
    read: () => strip(inner.read()),
    push: (url) => inner.push(prepend(url)),
    replace: (url) => inner.replace(prepend(url)),
    back: () => inner.back(),
    forward: () => inner.forward(),
    listen: (callback) => inner.listen((url) => callback(strip(url))),
    // Hrefs must round-trip: an anchor's literal URL is a cold-load entry
    // point, so it carries the prefix exactly like a push would.
    externalize: (url) => prepend(url)
  };
}
