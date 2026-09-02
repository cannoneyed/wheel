/**
 * `RouterService` — the current URL as an atom, everything else derived.
 *
 * That sentence is the whole design. The URL is state, navigation is an action,
 * and the matched route is a computed. Which means the router shows up in the
 * debug panel, the inspector, and every test seam exactly like a todo list
 * does — no special-casing, no second reactivity system to reconcile.
 *
 *   url    : Atom<string>              the address bar, and the source of truth
 *   match  : computed → RouteMatch     name, params, search — Zod-validated
 *   navigate / back / forward          actions
 *
 * Data flows one way in both directions, which sounds contradictory and isn't:
 *
 *   navigate()  →  url atom  →  history.push()      (the router drives the bar)
 *   popstate    →  url atom  →  match recomputes    (the bar drives the router)
 *
 * A history write never echoes back into the instance that made it — the
 * browser seam announces writes to OTHER router instances on the page (nested
 * provider trees share one address bar) but skips its own. That is the entire
 * loop-prevention story; see `browserHistory` in history.ts.
 *
 * You do not subclass this or inject it directly — `createRouter(routes)`
 * generates a table-bound subclass along with matching `<Link>` and `<Root>`
 * components, and THAT class is what a connect declaration injects.
 */
import type { z } from 'zod';

import { Service, type ServiceClass, type ServiceContext } from '../core/services';
import type { Atom, ComputedAccessor, ComputedFor } from '../core/services';
import { captureDeclSite } from '../core/decl-site';
import { fakeService } from '../core/stubs';

import { basedHistory, defaultHistory, memoryHistory, type RouterHistory } from './history';
import {
  buildUrl,
  compileRoutes,
  decodeSearchField,
  matchUrl,
  readRawSearch,
  searchParamsOf,
  withSearchParam,
  type BuildUrlOptions,
  type RouteMatch,
  type RouteTable
} from './match';
import type {
  RouteDef,
  RouteName,
  RouteNeedsNoArgs,
  RouteParams,
  RouteSearchInput,
  RouteSearchOutput
} from './types';

/** No fields — used to test whether a route needs params at all. */
type Empty = Record<never, never>;

/** Stable identities so `params()`/`search()` don't invalidate when nothing matches. */
const EMPTY_PARAMS: Readonly<Record<string, string>> = Object.freeze({});
const EMPTY_SEARCH: Readonly<Record<string, unknown>> = Object.freeze({});

/**
 * Coalescing window for URL-bound atom writes. Long enough that a burst of
 * keystrokes produces one address-bar write, short enough that a copied URL is
 * current by the time a hand reaches the address bar.
 */
const DEFAULT_SEARCH_DEBOUNCE_MS = 120;

/** `params` is required exactly when the route's path declares any. */
type ParamsArg<T extends RouteDef, N extends string> = Empty extends RouteParams<T, N>
  ? { readonly params?: RouteParams<T, N> }
  : { readonly params: RouteParams<T, N> };

/** Everything a navigation may specify. */
export type NavigateOptions<T extends RouteDef, N extends string> = ParamsArg<T, N> & {
  /** Search values; schema defaults and `undefined` are left out of the URL. */
  readonly search?: RouteSearchInput<T, N>;
  /** Fragment, with or without a leading `#`. */
  readonly hash?: string;
  /** Replace the current history entry instead of adding one. */
  readonly replace?: boolean;
};

/**
 * The options argument, required only when the route actually needs one.
 *
 * `navigate('home')` compiles; `navigate('team.issues')` does not, because that
 * route's chain declares `$teamId`. Expressed as a rest tuple because an
 * ordinary optional parameter cannot be conditionally required.
 */
export type NavigateArgs<T extends RouteDef, N extends string> = RouteNeedsNoArgs<
  T,
  N
> extends true
  ? [options?: NavigateOptions<T, N>]
  : [options: NavigateOptions<T, N>];

/** Navigation options addressed by plain string, used inside the router's own components. */
export interface UncheckedNavigateOptions extends BuildUrlOptions {
  /** Replace the current history entry instead of adding one. */
  readonly replace?: boolean;
}

/**
 * The active match seen from ONE route's point of view, with that route's
 * params and search typed.
 *
 * Returned for any route in the active chain, not just the leaf — so a layout
 * at `teams.detail` reads its own `teamId` while `teams.detail.issues` is what
 * actually matched. That is the whole reason nested routes are usable without a
 * `useParams()` hook.
 */
export interface TypedRouteMatch<T extends RouteDef, N extends string> {
  /** The route this view is taken from — the name passed to `matchOf`. */
  readonly name: N;
  /** The leaf route that actually matched, which may be deeper than `name`. */
  readonly matchedName: string;
  /** Path params, accumulated down the chain. */
  readonly params: RouteParams<T, N>;
  /** Search params, schema-validated with defaults applied. */
  readonly search: RouteSearchOutput<T, N>;
  /** The full active chain, outermost first. */
  readonly chain: readonly string[];
  /** Fragment without the `#`. */
  readonly hash: string;
  /** Path portion of the current URL. */
  readonly pathname: string;
}

/** The untyped shape `matchOf` memoizes; the typed view is a cast over it. */
interface NamedMatch {
  readonly name: string;
  readonly matchedName: string;
  readonly params: Readonly<Record<string, string>>;
  readonly search: Readonly<Record<string, unknown>>;
  readonly chain: readonly string[];
  readonly hash: string;
  readonly pathname: string;
}

/** How a URL-bound atom writes its value to the address bar. */
export interface SearchAtomOptions {
  /**
   * `'replace'` (the default) rewrites the current entry, so a filter box does
   * not fill the back stack. `'push'` adds an entry per write.
   */
  readonly history?: 'replace' | 'push';
  /**
   * Coalescing window in milliseconds for the address-bar write. The atom and
   * `url` update instantly; only the browser history call waits, because
   * browsers rate-limit `replaceState` and a filter box fires per keystroke.
   */
  readonly debounceMs?: number;
}

/** A search key bound to an atom, kept in sync with the URL in both directions. */
interface SearchBinding {
  readonly key: string;
  readonly declaredAt: string;
  /** Re-read this key from the current URL into the atom, without echoing back. */
  readonly adopt: () => void;
}

/**
 * Holds the `RouterHistory` the router drives. Its own service so tests can
 * swap in `memoryHistory()` through the ordinary override seam:
 *
 *   <ServiceProvider overrides={[memoryHistoryOverride(['/teams/a'])]}>
 */
export class RouterHistoryService extends Service {
  /** Identity that survives minification (see require-service-name). */
  static override serviceName = 'RouterHistoryService';

  /** The history implementation. Browser when a `window` exists, memory otherwise. */
  readonly history: RouterHistory = defaultHistory();
}

/**
 * A `ServiceProvider` override that points the router at an in-memory history.
 *
 *   <ServiceProvider overrides={[memoryHistoryOverride(['/teams/a'])]}>
 *     <Root />
 *   </ServiceProvider>
 *
 * Deterministic and synchronous: `back()` notifies before it returns, so a test
 * asserts on the next line with nothing to wait for.
 */
export function memoryHistoryOverride(entries?: readonly string[]): {
  original: ServiceClass;
  replacement: Service;
  ownership: 'caller';
} {
  return {
    original: RouterHistoryService,
    replacement: fakeService(RouterHistoryService, { history: memoryHistory(entries) }),
    ownership: 'caller'
  };
}

/**
 * A `ServiceProvider` override that mounts the router under a path prefix —
 * the address bar shows `/demos/todos` while the route table matches `/todos`.
 * Pass the deployment's base path (vite's `import.meta.env.BASE_URL`); a base
 * of `/` or `''` leaves the default history untouched.
 *
 *   <ServiceProvider overrides={[basedHistoryOverride(import.meta.env.BASE_URL)]}>
 *     <Root />
 *   </ServiceProvider>
 */
export function basedHistoryOverride(base: string): {
  original: ServiceClass;
  replacement: Service;
  ownership: 'caller';
} {
  return {
    original: RouterHistoryService,
    replacement: fakeService(RouterHistoryService, { history: basedHistory(defaultHistory(), base) }),
    ownership: 'caller'
  };
}

/**
 * The router. Instantiate through `createRouter(routes)` rather than injecting
 * this class directly — the generated subclass is what carries the route table
 * and therefore the types.
 */
export class RouterService<T extends RouteDef = RouteDef> extends Service {
  /** Identity that survives minification (see require-service-name). */
  static override serviceName = 'RouterService';

  /** State-tree group: wheel-internal plumbing, collapsed by default. */
  static override group = 'framework';

  /**
   * @internal The compiled table, set as a static on the subclass `createRouter`
   * generates. Read through `this.constructor` so the subclass's value wins.
   */
  static routeTable: RouteTable = compileRoutes({ path: '/' });

  private readonly historySeam = this.service(RouterHistoryService).history;

  /** The compiled route table this router navigates. */
  readonly table = (this.constructor as typeof RouterService).routeTable as RouteTable<T>;

  /**
   * The current path + search + hash. THE source of truth: history writes flow
   * into it, and everything the router exposes derives from it.
   */
  readonly url: Atom<string> = this.atom(this.historySeam.read(), 'url');

  /** The matched route, or `null` when the URL matches nothing in the table. */
  readonly match: ComputedAccessor<RouteMatch | null> = this.computed(
    () => matchUrl(this.table, this.url.get()),
    'match'
  );

  /** The matched route's dotted name, or `null` for a URL that matched nothing. */
  readonly routeName: ComputedAccessor<string | null> = this.computed(
    () => this.match()?.name ?? null,
    'routeName'
  );

  /** Path params of the current match; empty when nothing matched. */
  readonly params: ComputedAccessor<Readonly<Record<string, string>>> = this.computed(
    () => this.match()?.params ?? EMPTY_PARAMS,
    'params'
  );

  /** Search params of the current match, validated with defaults applied. */
  readonly search: ComputedAccessor<Readonly<Record<string, unknown>>> = this.computed(
    () => this.match()?.search ?? EMPTY_SEARCH,
    'search'
  );

  /**
   * Whether a route is anywhere in the active chain — what a nav link's
   * highlight wants. `isActive('team')` stays true on `team.issues`, so a
   * sidebar entry lights up for every page underneath it.
   */
  readonly isActive: ComputedFor<[name: string], boolean> = this.computedFor(
    (name: string) => this.match()?.chain.includes(name) ?? false,
    'isActive'
  );

  private readonly searchBindings = new Map<string, SearchBinding>();
  private readonly cancelHistoryWrite = this.field<(() => void) | null>(null);

  /** @internal The one write path for the URL: atom first, address bar second. */
  private readonly commit = this.action((url: string, replace: boolean) => {
    this.flushPendingHistoryWrite();
    this.url.set(url);
    if (replace) this.historySeam.replace(url);
    else this.historySeam.push(url);
    this.adoptSearchBindings();
  }, 'navigate');

  constructor(context: ServiceContext) {
    super(context);
    this.addCleanup(
      this.historySeam.listen((url) => {
        this.flushPendingHistoryWrite();
        this.url.set(url);
        this.adoptSearchBindings();
      })
    );
    this.addCleanup(() => this.flushPendingHistoryWrite());
  }

  /**
   * Go to a route. Params are required exactly when the route declares them,
   * and unknown names are a compile error.
   *
   *   router.navigate('team.issues', { params: { teamId }, search: { tab: 'board' } });
   */
  readonly navigate = <N extends RouteName<T>>(name: N, ...args: NavigateArgs<T, N>): void => {
    this.navigateUnchecked(name, (args[0] ?? {}) as UncheckedNavigateOptions);
  };

  /**
   * The URL a navigation would produce — what `<Link>` puts in its `href`.
   * Externalized through the history seam: under `basedHistory` the mount
   * prefix is included, so copied/cmd-clicked links stay inside the app.
   */
  readonly href = <N extends RouteName<T>>(name: N, ...args: NavigateArgs<T, N>): string => {
    const url = buildUrl(this.table, name, (args[0] ?? {}) as BuildUrlOptions);
    return this.historySeam.externalize?.(url) ?? url;
  };

  /**
   * @internal Navigation by plain string, for `<Link>`, which already checks
   * its own props against the table at the type level. App code uses
   * `navigate`, which does that checking for you.
   */
  readonly navigateUnchecked = (name: string, options: UncheckedNavigateOptions = {}): void => {
    this.commit(buildUrl(this.table, name, options), options.replace === true);
  };

  /** @internal String-keyed counterpart of `href`, for `<Link>` — externalized the same way. */
  readonly hrefUnchecked = (name: string, options: UncheckedNavigateOptions = {}): string => {
    const url = buildUrl(this.table, name, options);
    return this.historySeam.externalize?.(url) ?? url;
  };

  /**
   * The active match seen from one route's point of view, or `null` when that
   * route is not in the active chain. This is how a route component reads its
   * own params with types, and it is why no `useParams()` hook is needed:
   *
   *   teamId: () => router.matchOf('teams.detail')?.params.teamId
   *
   * Works for layouts too — `teams.detail` answers while `teams.detail.issues`
   * is the leaf that matched, because params accumulate down the chain.
   */
  readonly matchOf = <N extends RouteName<T>>(name: N): TypedRouteMatch<T, N> | null => {
    return this.matchInChain(name) as TypedRouteMatch<T, N> | null;
  };

  /** @internal One memo per route name, so `matchOf` is cheap inside a render. */
  private readonly matchInChain: ComputedFor<[name: string], NamedMatch | null> = this.computedFor(
    (name: string): NamedMatch | null => {
      const current = this.match();
      if (!current || !current.chain.includes(name)) return null;
      return {
        name,
        matchedName: current.name,
        params: current.params,
        search: current.search,
        chain: current.chain,
        hash: current.hash,
        pathname: current.pathname
      };
    },
    'matchOf'
  );

  /** Go back one history entry. */
  readonly back = this.action(() => {
    this.flushPendingHistoryWrite();
    this.historySeam.back();
  }, 'back');

  /** Go forward one history entry. */
  readonly forward = this.action(() => {
    this.flushPendingHistoryWrite();
    this.historySeam.forward();
  }, 'forward');

  /**
   * An atom whose value lives in the URL query string.
   *
   *   class IssueFilterService extends Service {
   *     private readonly router = this.service(AppRouter);
   *     readonly query = this.router.searchAtom('q', z.string().default(''));
   *   }
   *
   * Read and write it like any other atom. Writes update the atom and `url`
   * immediately and the address bar on a short coalescing delay; back and
   * forward write the URL's value back into the atom. Nothing that reads the
   * atom knows a URL is involved — which is what makes every filter, sort, and
   * selection a shareable link for free.
   *
   * The atom is a normal `Service` field on whichever service declares it, so
   * the debug panel attributes it there, not to the router.
   */
  readonly searchAtom = <S extends z.ZodType>(
    key: string,
    schema: S,
    options: SearchAtomOptions = {}
  ): Atom<z.output<S>> => {
    const declaredAt = captureDeclSite(/\/router\/router-service\.(?:ts|js)/);
    const existing = this.searchBindings.get(key);
    if (existing) {
      throw new Error(
        `Duplicate search key '${key}'. First bound at ${existing.declaredAt}; duplicate bound at ${declaredAt}.`
      );
    }
    const readFromUrl = (): z.output<S> => {
      const raw = readRawSearch(searchParamsOf(this.url.get()), key);
      return decodeSearchField(schema, raw).value as z.output<S>;
    };
    // A value equal to the schema's default is left OUT of the URL, so a page
    // at rest has a clean address bar and a shared link carries only what the
    // sharer actually changed.
    const fallback = JSON.stringify(decodeSearchField(schema, undefined).value);
    const inner = this.atom(readFromUrl(), key);
    const publish = (value: unknown): void => {
      const omit = JSON.stringify(value) === fallback;
      const next = withSearchParam(this.url.get(), key, omit ? undefined : value);
      if (next === this.url.get()) return;
      this.url.set(next);
      this.scheduleHistoryWrite(next, options);
    };
    this.searchBindings.set(key, {
      key,
      declaredAt,
      adopt: () => inner.set(readFromUrl())
    });
    return {
      get: inner.get,
      set: (value) => {
        inner.set(value);
        publish(value);
      },
      update: (recipe) => {
        inner.update(recipe);
        publish(inner.get());
      },
      __debugMeta: inner.__debugMeta
    };
  };

  /** Write the address bar after the coalescing window, superseding any pending write. */
  private scheduleHistoryWrite(url: string, options: SearchAtomOptions): void {
    this.cancelHistoryWrite.get()?.();
    this.cancelHistoryWrite.set(null);
    const write = (): void => {
      this.cancelHistoryWrite.set(null);
      if (options.history === 'push') this.historySeam.push(url);
      else this.historySeam.replace(url);
    };
    const delay = options.debounceMs ?? DEFAULT_SEARCH_DEBOUNCE_MS;
    if (delay <= 0) {
      write();
      return;
    }
    this.cancelHistoryWrite.set(this.defer(delay, write));
  }

  /** Drop a pending address-bar write; whatever caused this supersedes it. */
  private flushPendingHistoryWrite(): void {
    this.cancelHistoryWrite.get()?.();
    this.cancelHistoryWrite.set(null);
  }

  /** Re-read every bound search key from the current URL. */
  private adoptSearchBindings(): void {
    for (const binding of this.searchBindings.values()) binding.adopt();
  }
}
