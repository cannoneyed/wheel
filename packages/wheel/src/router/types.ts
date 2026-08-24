/**
 * The route table's type-level half: turning a nested route literal into
 * dotted names, per-name path params, and per-name search shapes.
 *
 * This file contains the only clever types in the router. Everything else is
 * ordinary runtime code. The job, concretely:
 *
 *   const routes = defineRoutes({
 *     path: '/',
 *     children: {
 *       team: { path: 'teams/$teamId', children: {
 *         issues: { path: 'issues' }
 *       }}
 *     }
 *   });
 *
 *   RouteName<typeof routes>            // 'team' | 'team.issues'
 *   RouteParams<Root, 'team.issues'>    // { teamId: string }
 *
 * `$teamId` marks a path param (syntax borrowed from TanStack Router). Params
 * accumulate down the chain, so a deep route requires every ancestor's params.
 *
 * If these types break, the failure is silent and nasty: every route degrades
 * to `Record<string, string>` params and nothing errors. `index.test-d.ts`
 * exists to make that loud — it asserts both the accepted and the rejected
 * shapes.
 */
import type { JSX } from 'solid-js';
import type { z } from 'zod';

/** A route's component: an ordinary Solid component, no router-specific props. */
export type RouteComponent = () => JSX.Element;

/** The child map of a route node — keys are the route's short names. */
export interface RouteChildren {
  readonly [name: string]: RouteDef;
}

/**
 * One node in the route tree.
 *
 * A node with `children` is a layout: its component renders `<Outlet/>` where
 * the child should appear. A node without children is a leaf. The ROOT node is
 * never itself a match target — declare an index child (`path: '/'`) if `/`
 * should render something.
 */
export interface RouteDef {
  /** Path fragment relative to the parent. `'/'` or `''` contributes no segments; `$name` marks a param. */
  readonly path: string;
  /** Rendered when this node is in the matched chain. Layouts render `<Outlet/>`. */
  readonly component?: RouteComponent;
  /**
   * Search-param schema for this node. Must be a `z.object({...})` so each
   * field can be decoded individually. Schemas merge down the chain; a child
   * key wins over an ancestor's key of the same name.
   */
  readonly search?: z.ZodObject;
  /** Named children. Their names compose into dotted route names. */
  readonly children?: RouteChildren;
}

/** Flattens an intersection into one readable object type. */
type Simplify<T> = { [K in keyof T]: T[K] };

/** No fields — the identity element for the intersections below. */
type Empty = Record<never, never>;

/**
 * The params a single `path` fragment declares.
 *
 * `'teams/$teamId'` → `{ teamId: string }`; `'issues'` → no fields. Path params
 * are always `string` — a route that wants a number parses it in the service
 * that uses it, so the router never guesses at a URL's meaning.
 */
export type PathParams<P extends string> = P extends `${infer Head}/${infer Rest}`
  ? PathParams<Head> & PathParams<Rest>
  : P extends `$${infer Name}`
    ? { readonly [K in Name]: string }
    : Empty;

/**
 * Every navigable name in a tree, as a dotted string union.
 *
 * A node with no children contributes just its own name (`` `${K}.${never}` ``
 * collapses to `never`, which vanishes from the union). The root contributes
 * nothing — it is a layout, not a destination.
 */
export type RouteName<T extends RouteDef> = T extends {
  readonly children: infer C extends RouteChildren;
}
  ? { [K in keyof C & string]: K | `${K}.${RouteName<C[K]>}` }[keyof C & string]
  : never;

/** Walks `Name` down `T`'s children, intersecting each node's path params. */
type DescendParams<T extends RouteDef, Name extends string> = T extends {
  readonly children: infer C extends RouteChildren;
}
  ? Name extends `${infer Head}.${infer Rest}`
    ? Head extends keyof C
      ? PathParams<C[Head]['path']> & DescendParams<C[Head], Rest>
      : Empty
    : Name extends keyof C
      ? PathParams<C[Name]['path']>
      : Empty
  : Empty;

/**
 * The params required to navigate to `Name`, accumulated from the root down.
 *
 * `RouteParams<Root, 'team.issues'>` is `{ teamId: string }` when `team`
 * declares `$teamId` — the child inherits its ancestors' params, so a call site
 * cannot forget one.
 */
export type RouteParams<T extends RouteDef, Name extends string> = Simplify<
  PathParams<T['path']> & DescendParams<T, Name>
>;

/** The declared input type of a node's own search schema, or no fields. */
type SearchInputOf<T extends RouteDef> = T extends { readonly search: infer S extends z.ZodObject }
  ? z.input<S>
  : Empty;

/** The parsed output type of a node's own search schema, or no fields. */
type SearchOutputOf<T extends RouteDef> = T extends { readonly search: infer S extends z.ZodObject }
  ? z.output<S>
  : Empty;

/** Walks `Name` down `T`'s children, intersecting each node's search input. */
type DescendSearchInput<T extends RouteDef, Name extends string> = T extends {
  readonly children: infer C extends RouteChildren;
}
  ? Name extends `${infer Head}.${infer Rest}`
    ? Head extends keyof C
      ? SearchInputOf<C[Head]> & DescendSearchInput<C[Head], Rest>
      : Empty
    : Name extends keyof C
      ? SearchInputOf<C[Name]>
      : Empty
  : Empty;

/** Walks `Name` down `T`'s children, intersecting each node's search output. */
type DescendSearchOutput<T extends RouteDef, Name extends string> = T extends {
  readonly children: infer C extends RouteChildren;
}
  ? Name extends `${infer Head}.${infer Rest}`
    ? Head extends keyof C
      ? SearchOutputOf<C[Head]> & DescendSearchOutput<C[Head], Rest>
      : Empty
    : Name extends keyof C
      ? SearchOutputOf<C[Name]>
      : Empty
  : Empty;

/**
 * What a caller may PASS as search when navigating to `Name` — the merged
 * schemas' input type, so fields with defaults stay optional.
 */
export type RouteSearchInput<T extends RouteDef, Name extends string> = Simplify<
  SearchInputOf<T> & DescendSearchInput<T, Name>
>;

/**
 * What a matched route REPORTS as search for `Name` — the merged schemas'
 * output type, so defaults are already applied and every field is present.
 */
export type RouteSearchOutput<T extends RouteDef, Name extends string> = Simplify<
  SearchOutputOf<T> & DescendSearchOutput<T, Name>
>;

/**
 * True when navigating to `Name` needs no arguments at all — no params and no
 * required search fields. Lets `navigate('home')` typecheck without an options
 * object while `navigate('team.issues')` still demands `{ params: { teamId } }`.
 */
export type RouteNeedsNoArgs<T extends RouteDef, Name extends string> = Empty extends RouteParams<
  T,
  Name
>
  ? Empty extends RouteSearchInput<T, Name>
    ? true
    : false
  : false;
