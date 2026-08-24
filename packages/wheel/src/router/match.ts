/**
 * The matcher: URL text in, matched route out — and the exact inverse.
 *
 * Pure functions only. No DOM, no Solid, no service. That is deliberate: the
 * hard parts of a router (segment matching, param binding, search decoding, URL
 * building) are all decidable from strings, so they get tested as strings.
 * `RouterService` adds reactivity on top and nothing else.
 *
 * Two contracts hold everything together:
 *
 * 1. `buildUrl(matchUrl(url))` returns `url` (modulo default search values,
 *    which are omitted). The round-trip test table is the real spec.
 * 2. Nothing here throws on bad input from a URL bar. A hand-edited URL yields
 *    `null` (no match) or falls back to schema defaults — never an exception.
 *    A router that crashes on a typo'd URL is worse than one that shows a 404.
 *
 * Search decoding, per field: try the raw string first, then a JSON decode,
 * then the schema's default. So `z.string()` sees `'123'` as the string it is,
 * while `z.number()` sees it as `123`, and neither needs `z.coerce`.
 */
import type { z } from 'zod';

import type { RouteChildren, RouteDef } from './types';

/** One parsed piece of a path pattern: fixed text or a `$name` capture. */
export type Segment =
  | { readonly kind: 'static'; readonly value: string }
  | { readonly kind: 'param'; readonly name: string };

/**
 * One navigable route, flattened out of the tree with its full pattern
 * resolved. The table holds these; matching is a scan over them.
 */
export interface CompiledRoute {
  /** Dotted name, e.g. `team.issues`. */
  readonly name: string;
  /** Ancestor names then this one: `['team', 'team.issues']`. */
  readonly chain: readonly string[];
  /** The full pattern from the root, not just this node's fragment. */
  readonly segments: readonly Segment[];
  /** Root node first, this node last — the render chain and the schema chain. */
  readonly nodes: readonly RouteDef[];
  /** Search values the schemas produce for an empty query string. */
  readonly searchDefaults: Readonly<Record<string, unknown>>;
  /** Depth below the root; deeper wins when two routes both match. */
  readonly depth: number;
  /** Param segments in the pattern; fewer wins when depth ties (static beats dynamic). */
  readonly paramCount: number;
  /** Declaration order; the final tiebreak, so matching is never ambiguous. */
  readonly order: number;
}

/**
 * A compiled route table. Carries its literal tree as a phantom type so
 * `navigate` and `<Link>` can check names, params, and search against it.
 */
export interface RouteTable<T extends RouteDef = RouteDef> {
  /** The literal definition passed to `defineRoutes`, kept for type inference. */
  readonly root: T;
  /** Every navigable route, in declaration order. */
  readonly routes: readonly CompiledRoute[];
  /** Dotted name → compiled route. */
  readonly byName: ReadonlyMap<string, CompiledRoute>;
}

/** A URL that matched a route in the table. */
export interface RouteMatch {
  /** The matched route's dotted name. */
  readonly name: string;
  /** Ancestors then the match: what `<Outlet/>` renders, outermost first. */
  readonly chain: readonly string[];
  /** Path params, percent-decoded, accumulated from the whole chain. */
  readonly params: Readonly<Record<string, string>>;
  /** Search params, decoded and schema-validated, with defaults applied. */
  readonly search: Readonly<Record<string, unknown>>;
  /** Fragment without the `#`, empty when absent. */
  readonly hash: string;
  /** Path portion of the matched URL, without search or hash. */
  readonly pathname: string;
  /** Root node first, matched node last — what the outlet chain renders. */
  readonly nodes: readonly RouteDef[];
}

/** Options accepted when building a URL for a route. */
export interface BuildUrlOptions {
  /** Path params; every `$name` in the pattern must be present. */
  readonly params?: Readonly<Record<string, string>>;
  /** Search values; `undefined` and schema-default values are omitted. */
  readonly search?: Readonly<Record<string, unknown>>;
  /** Fragment, with or without a leading `#`. */
  readonly hash?: string;
}

/** Base used only to parse relative URLs; never appears in output. */
const PARSE_BASE = 'http://wheel.invalid';

/**
 * Declare a route tree. The `const` type parameter keeps every path string
 * literal, which is what makes `navigate('team.issues', { params: { teamId } })`
 * typecheck against the actual tree rather than `string`.
 *
 * Most apps do not call this directly — `createRouter(routes)` in
 * `router-service.ts` calls it and hands back the service class and the
 * table-bound components together.
 */
export function defineRoutes<const T extends RouteDef>(root: T): RouteTable<T> {
  return compileRoutes(root);
}

/**
 * Compile a nested route literal into a table.
 *
 * Throws at startup — not at navigation time — for a duplicate param name in
 * one chain or a malformed `$` segment. Both are typos that would otherwise
 * surface as a mysteriously empty param much later.
 */
export function compileRoutes<T extends RouteDef>(root: T): RouteTable<T> {
  const routes: CompiledRoute[] = [];
  let order = 0;

  const walk = (
    children: RouteChildren,
    prefix: string,
    parentChain: readonly string[],
    parentSegments: readonly Segment[],
    parentNodes: readonly RouteDef[]
  ): void => {
    for (const [key, node] of Object.entries(children)) {
      if (key.includes('.')) {
        throw new Error(`Route name '${key}' cannot contain '.' — dots separate names in a dotted path.`);
      }
      const name = prefix ? `${prefix}.${key}` : key;
      const own = parseSegments(node.path, name);
      const segments = [...parentSegments, ...own];
      const nodes = [...parentNodes, node];
      const chain = [...parentChain, name];
      assertUniqueParams(segments, name);
      routes.push({
        name,
        chain,
        segments,
        nodes,
        searchDefaults: defaultsFor(nodes),
        depth: chain.length,
        paramCount: segments.filter((segment) => segment.kind === 'param').length,
        order: order++
      });
      if (node.children) walk(node.children, name, chain, segments, nodes);
    }
  };

  walk(root.children ?? {}, '', [], parseSegments(root.path, '<root>'), [root]);

  const byName = new Map<string, CompiledRoute>();
  for (const route of routes) byName.set(route.name, route);
  return { root, routes, byName };
}

/**
 * Match a URL (absolute or path-relative) against the table.
 *
 * Returns `null` when nothing matches — the caller renders its not-found view.
 * Never throws: URLs come from users.
 *
 * Ambiguity is resolved deterministically, deepest first: a longer chain beats
 * a shorter one, then fewer path params (so `/teams/new` prefers a literal
 * `new` route over `$teamId`), then declaration order.
 */
export function matchUrl(table: RouteTable, url: string): RouteMatch | null {
  let parsed: URL;
  try {
    parsed = new URL(url, PARSE_BASE);
  } catch {
    return null;
  }
  const urlSegments = parsed.pathname.split('/').filter(Boolean);
  let best: CompiledRoute | null = null;
  let bestParams: Record<string, string> | null = null;
  for (const route of table.routes) {
    const params = bindSegments(route.segments, urlSegments);
    if (!params) continue;
    if (best && !outranks(route, best)) continue;
    best = route;
    bestParams = params;
  }
  if (!best || !bestParams) return null;
  return {
    name: best.name,
    chain: best.chain,
    params: bestParams,
    search: parseSearch(best, parsed.searchParams),
    hash: parsed.hash.replace(/^#/, ''),
    pathname: parsed.pathname,
    nodes: best.nodes
  };
}

/**
 * Build the URL for a named route. The exact inverse of `matchUrl`.
 *
 * Throws for an unknown name or a missing param — both are programmer errors a
 * call site can fix, unlike a bad URL from a user. Search values equal to their
 * schema default are omitted, so a freshly-loaded page has a clean URL.
 */
export function buildUrl(table: RouteTable, name: string, options: BuildUrlOptions = {}): string {
  const route = table.byName.get(name);
  if (!route) {
    const known = [...table.byName.keys()].join(', ');
    throw new Error(`Unknown route '${name}'. Known routes: ${known || '(none)'}`);
  }
  const parts = route.segments.map((segment) => {
    if (segment.kind === 'static') return encodeURIComponent(segment.value);
    const value = options.params?.[segment.name];
    if (value === undefined) {
      throw new Error(`Route '${name}' needs param '${segment.name}'.`);
    }
    return encodeURIComponent(value);
  });
  const pathname = `/${parts.join('/')}`;
  const query = new URLSearchParams();
  for (const key of Object.keys(options.search ?? {}).sort()) {
    const value = options.search?.[key];
    if (value === undefined) continue;
    if (isDefaultValue(route, key, value)) continue;
    query.set(key, encodeSearchValue(value));
  }
  const search = query.toString();
  const hash = options.hash ? options.hash.replace(/^#/, '') : '';
  return `${pathname}${search ? `?${search}` : ''}${hash ? `#${hash}` : ''}`;
}

/** Split a path fragment into segments; `'/'` and `''` contribute none. */
function parseSegments(path: string, routeName: string): Segment[] {
  return path
    .split('/')
    .filter(Boolean)
    .map((raw) => {
      if (!raw.startsWith('$')) return { kind: 'static', value: decodeURIComponent(raw) } as const;
      const name = raw.slice(1);
      if (!name) {
        throw new Error(`Route '${routeName}' has a '$' segment with no param name.`);
      }
      return { kind: 'param', name } as const;
    });
}

/** Reject two `$name` captures with the same name in one chain. */
function assertUniqueParams(segments: readonly Segment[], routeName: string): void {
  const seen = new Set<string>();
  for (const segment of segments) {
    if (segment.kind !== 'param') continue;
    if (seen.has(segment.name)) {
      throw new Error(`Route '${routeName}' declares param '${segment.name}' twice in its path chain.`);
    }
    seen.add(segment.name);
  }
}

/** Bind a pattern against URL segments, or `null` when it does not match. */
function bindSegments(
  pattern: readonly Segment[],
  urlSegments: readonly string[]
): Record<string, string> | null {
  if (pattern.length !== urlSegments.length) return null;
  const params: Record<string, string> = {};
  for (let index = 0; index < pattern.length; index += 1) {
    const segment = pattern[index];
    const actual = urlSegments[index];
    if (segment.kind === 'static') {
      if (decodeSegment(actual) !== segment.value) return null;
      continue;
    }
    params[segment.name] = decodeSegment(actual);
  }
  return params;
}

/** Percent-decode one path segment, tolerating malformed escapes. */
function decodeSegment(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Deeper wins; then fewer params; then earlier declaration. */
function outranks(candidate: CompiledRoute, incumbent: CompiledRoute): boolean {
  if (candidate.depth !== incumbent.depth) return candidate.depth > incumbent.depth;
  if (candidate.paramCount !== incumbent.paramCount) {
    return candidate.paramCount < incumbent.paramCount;
  }
  return candidate.order < incumbent.order;
}

/** Values every schema in the chain produces from an empty query string. */
function defaultsFor(nodes: readonly RouteDef[]): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const node of nodes) {
    if (!node.search) continue;
    const parsed = node.search.safeParse({});
    if (parsed.success) Object.assign(defaults, parsed.data);
  }
  return defaults;
}

/**
 * Decode and validate the query string against the chain's schemas.
 *
 * Field by field, so mixed types work without `z.coerce`: the raw string is
 * tried first, then a JSON decode, then the field's own default. A field that
 * satisfies none of the three is dropped rather than throwing.
 */
function parseSearch(route: CompiledRoute, query: URLSearchParams): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const node of route.nodes) {
    if (!node.search) continue;
    for (const [key, field] of Object.entries(node.search.shape as Record<string, z.ZodType>)) {
      const decoded = decodeSearchField(field, readRawSearch(query, key));
      if (decoded.present) result[key] = decoded.value;
    }
  }
  return result;
}

/**
 * Decode one query value against one field schema.
 *
 * Three attempts in order — the raw string, a JSON decode, then the schema's
 * own default — so `z.string()` sees `'123'` as text while `z.number()` sees
 * `123`, and neither call site needs `z.coerce`. A value satisfying none of the
 * three reports `present: false` rather than throwing, because the input came
 * from a URL bar.
 */
export function decodeSearchField(
  schema: z.ZodType,
  raw: string | readonly string[] | undefined
): { readonly present: boolean; readonly value: unknown } {
  if (raw !== undefined) {
    const asString = schema.safeParse(raw);
    if (asString.success) return { present: true, value: asString.data };
    const asJson = schema.safeParse(decodeSearchValue(raw));
    if (asJson.success) return { present: true, value: asJson.data };
  }
  const fallback = schema.safeParse(undefined);
  if (fallback.success && fallback.data !== undefined) {
    return { present: true, value: fallback.data };
  }
  return { present: false, value: undefined };
}

/** One value, or an array when the key repeats (`?tag=a&tag=b`). */
export function readRawSearch(
  query: URLSearchParams,
  key: string
): string | string[] | undefined {
  const all = query.getAll(key);
  if (all.length === 0) return undefined;
  return all.length === 1 ? all[0] : all;
}

/** The query parameters of any absolute or path-relative URL. */
export function searchParamsOf(url: string): URLSearchParams {
  return new URL(url, PARSE_BASE).searchParams;
}

/**
 * Return `url` with one search key set (or deleted, for `undefined`).
 *
 * Used by URL-bound search atoms, which change one key at a time and must
 * leave every other part of the location — path, other keys, hash — alone.
 */
export function withSearchParam(url: string, key: string, value: unknown): string {
  const parsed = new URL(url, PARSE_BASE);
  if (value === undefined) parsed.searchParams.delete(key);
  else parsed.searchParams.set(key, encodeSearchValue(value));
  parsed.searchParams.sort();
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

/** JSON-decode when possible; keep the text otherwise. Arrays decode elementwise. */
function decodeSearchValue(raw: string | readonly string[]): unknown {
  if (Array.isArray(raw)) return raw.map((entry) => decodeSearchValue(entry));
  try {
    return JSON.parse(raw as string) as unknown;
  } catch {
    return raw;
  }
}

/** Strings go in as-is (so they survive the raw-string decode); everything else as JSON. */
export function encodeSearchValue(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/** Whether a search value matches the route's default, and can be left out of the URL. */
function isDefaultValue(route: CompiledRoute, key: string, value: unknown): boolean {
  if (!(key in route.searchDefaults)) return false;
  return JSON.stringify(route.searchDefaults[key]) === JSON.stringify(value);
}
