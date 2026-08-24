/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-use-signal -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
import { createSignal, splitProps, Show, type JSX } from 'solid-js';
import { EMPTY_OBJECT } from '../../base-utils/empty';
import { useDismiss, useHoverFloatingInteraction, type ElementProps } from '../../floating-ui-solid';
import { getTarget } from '../../floating-ui-solid/utils';
import type { BaseUIComponentProps, HTMLProps } from '../../internals/types';
import { renderElement } from '../../internals/renderElement';
import { CompositeRoot } from '../../internals/composite/root/CompositeRoot';
import {
  useNavigationMenuRootContext,
  useNavigationMenuTreeContext,
} from '../root/NavigationMenuRootContext';
import { NAVIGATION_MENU_TRIGGER_IDENTIFIER } from '../utils/constants';
import { NavigationMenuDismissContext } from './NavigationMenuDismissContext';
import { getEmptyRootContext } from '../utils/getEmptyRootContext';
import { FloatingRootContextBoundary } from '../utils/FloatingRootContextBoundary';

const fallbackContext = getEmptyRootContext();

/**
 * Contains a list of navigation menu items.
 * Renders a `<ul>` element.
 *
 * Documentation: [Base UI Navigation Menu](https://base-ui.com/react/components/navigation-menu)
 */
export function NavigationMenuList(componentProps: NavigationMenuList.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'ref',
  ]);

  const nodeId = useNavigationMenuTreeContext();

  const {
    orientation,
    open,
    floatingRootContext,
    positionerElement,
    value,
    closeDelay,
    viewportElement,
    nested,
  } = useNavigationMenuRootContext();

  const context = () => floatingRootContext() || fallbackContext;
  const interactionsEnabled = () => positionerElement() != null || value() == null;
  const hoverInteractionsEnabled = () =>
    positionerElement() != null || viewportElement() != null || value() == null;

  const [dismissProps, setDismissProps] = createSignal<ElementProps | undefined>(undefined);

  const state: NavigationMenuListState = {
    get open() {
      return open();
    },
  };

  // `stopEventPropagation` won't stop the propagation if the end of the list is reached,
  // but we want to block it in this case.
  // When nested, skip this handler so arrow keys can reach the parent CompositeRoot.
  const defaultProps: HTMLProps = nested
    ? EMPTY_OBJECT
    : {
        onKeyDown(event: KeyboardEvent) {
          const shouldStop =
            (orientation() === 'horizontal' &&
              (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) ||
            (orientation() === 'vertical' && (event.key === 'ArrowUp' || event.key === 'ArrowDown'));

          if (shouldStop) {
            event.stopPropagation();
          }
        },
      };

  // `props` is consumed later inside this component's returned JSX (both branches below); the
  // linter can't trace an array built once and spread into `renderElement`/`CompositeRoot` further
  // down, so it (incorrectly) flags this as an untracked read.
  const props = [() => dismissProps()?.floating ?? EMPTY_OBJECT, defaultProps, elementProps];

  const interactions = (
    <FloatingRootContextBoundary context={context()}>
      {(ctx) => {
        useHoverFloatingInteraction(ctx, {
          enabled: () => Boolean(floatingRootContext()) && hoverInteractionsEnabled(),
          closeDelay,
          nodeId,
        });

        const dismiss = useDismiss(ctx, {
          enabled: interactionsEnabled,
          outsidePressEvent: () => 'intentional',
          outsidePress: () => (event: MouseEvent | TouchEvent) => {
            const target = getTarget(event) as HTMLElement | null;
            const closestNavigationMenuTrigger = target?.closest(
              `[${NAVIGATION_MENU_TRIGGER_IDENTIFIER}]`,
            );
            return closestNavigationMenuTrigger === null;
          },
        });

        setDismissProps(floatingRootContext() ? dismiss : undefined);

        return undefined as unknown as JSX.Element;
      }}
    </FloatingRootContextBoundary>
  );

  // When nested, skip the CompositeRoot wrapper so that triggers can participate
  // in the parent Content's composite navigation context. The key propagation
  // guard is already omitted through `defaultProps` above. `nested` is a structural fact about
  // this component instance (never toggles after mount), so branching with `<Show>` rather than a
  // reactive condition is intentional — it only needs to run once.
  return (
    <NavigationMenuDismissContext.Provider value={dismissProps}>
      {interactions}
      <Show
        when={!nested}
        fallback={renderElement('ul', componentProps, {
          defaultClass: 'wheel-NavigationMenu-List',
          slot: 'navigation-menu-list',
          state,
          props,
        })}
      >
        <CompositeRoot<never, NavigationMenuListState>
          as={componentProps.as}
          asChild={componentProps.asChild}
          class={componentProps.class}
          style={componentProps.style}
          state={state}
          defaultClass="wheel-NavigationMenu-List"
          slot="navigation-menu-list"
          refs={[(el: any) => componentProps.ref?.(el)]}
          props={props}
          loopFocus={false}
          orientation={orientation()}
          tag="ul"
        >
          {componentProps.children}
        </CompositeRoot>
      </Show>
    </NavigationMenuDismissContext.Provider>
  );
}

export interface NavigationMenuListState {
  /**
   * If `true`, the popup is open.
   */
  open: boolean;
}

export interface NavigationMenuListProps
  extends BaseUIComponentProps<'ul', NavigationMenuListState> {}

export namespace NavigationMenuList {
  export type State = NavigationMenuListState;
  export type Props = NavigationMenuListProps;
}
