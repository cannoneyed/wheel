/**
 * `<Link>` — a real `<a href>` that the router intercepts.
 *
 * It renders the actual URL into `href`, so cmd-click, middle-click,
 * "open in new tab", "copy link address", and status-bar preview all work
 * without the component knowing anything about them. The click handler bails
 * out on exactly the cases the browser should own:
 *
 *   modifier held · non-left button · `target` set · already prevented
 *
 * `to` and `params` are checked against the route table, so a link to a route
 * that does not exist — or one missing a param — is a compile error rather
 * than a 404 someone finds later.
 */
import type { JSX } from 'solid-js';

import { componentRoot, connect } from '../core/connect';
import { view } from '../core/view';
import type { ServiceClass } from '../core/services';

import type { RouterService, UncheckedNavigateOptions } from './router-service';
import type { RouteDef, RouteName, RouteParams, RouteSearchInput } from './types';

/** No fields — used to make `params` optional for routes that declare none. */
type Empty = Record<never, never>;

/** `params` is required exactly when the target route's chain declares any. */
type LinkParams<T extends RouteDef, N extends RouteName<T>> = Empty extends RouteParams<T, N>
  ? { readonly params?: RouteParams<T, N> }
  : { readonly params: RouteParams<T, N> };

/** Props for the typed `<Link>` a router generates. */
export type LinkProps<T extends RouteDef, N extends RouteName<T>> = LinkParams<T, N> & {
  /** Destination route, by dotted name. */
  readonly to: N;
  /** Search values for the destination; schema defaults are left out of the URL. */
  readonly search?: RouteSearchInput<T, N>;
  /** Fragment, with or without a leading `#`. */
  readonly hash?: string;
  /** Replace the current history entry instead of adding one. */
  readonly replace?: boolean;
  /** Always applied. */
  readonly class?: string;
  /** Added while `to` is anywhere in the active chain — so a section link stays lit on its children. */
  readonly activeClass?: string;
  /** Opens in a new context; the router does not intercept when set. */
  readonly target?: string;
  /** Accessible label when the link's content is an icon. */
  readonly 'aria-label'?: string;
  /** Test hook, forwarded to the anchor. */
  readonly 'data-testid'?: string;
  /** Link content. */
  readonly children?: JSX.Element;
};

/** The generated `<Link>`: generic over destination so each `to` types its own params. */
export type LinkComponent<T extends RouteDef> = <N extends RouteName<T>>(
  props: LinkProps<T, N>
) => JSX.Element;

/**
 * Build the `<Link>` component for one router service class.
 *
 * @internal Called by `createRouter`; apps use the returned `Link`.
 */
export function createRouterLink<T extends RouteDef>(
  RouterClass: ServiceClass<RouterService<T>>
): LinkComponent<T> {
  const connectLink = connect('Link', (c) => {
    const router = c.service(RouterClass);
    return view(
      // Tracks the router so the active class recomputes on navigation.
      { route: router.routeName },
      {
        href: router.hrefUnchecked,
        navigate: router.navigateUnchecked,
        isActive: router.isActive
      }
    );
  });

  return function Link<N extends RouteName<T>>(props: LinkProps<T, N>): JSX.Element {
    const state = connectLink({});
    const options = (): UncheckedNavigateOptions => ({
      params: (props as { params?: Record<string, string> }).params,
      search: props.search as Record<string, unknown> | undefined,
      hash: props.hash,
      replace: props.replace
    });
    const active = (): boolean => state.isActive(props.to);
    const onClick = (event: MouseEvent): void => {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (props.target) return;
      event.preventDefault();
      state.navigate(props.to, options());
    };
    return (
      <a
        use:componentRoot
        href={state.href(props.to, options())}
        target={props.target}
        onClick={onClick}
        class={[props.class, active() ? props.activeClass : undefined].filter(Boolean).join(' ')}
        aria-current={active() ? 'page' : undefined}
        aria-label={props['aria-label']}
        data-testid={props['data-testid']}
      >
        {props.children}
      </a>
    );
  };
}
