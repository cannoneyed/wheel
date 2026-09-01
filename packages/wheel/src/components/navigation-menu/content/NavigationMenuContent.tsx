/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-tracked-show -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { useSignal } from '../../../core/local-state';
import { createEffect, splitProps, Show, type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';
import { inertValue } from '../../base-utils/inertValue';
import { FloatingNode } from '../../floating-ui-solid';
import { contains, getTarget } from '../../floating-ui-solid/utils';
import type { BaseUIComponentProps, HTMLProps } from '../../internals/types';
import {
  useNavigationMenuRootContext,
  useNavigationMenuTreeContext,
} from '../root/NavigationMenuRootContext';
import { useNavigationMenuItemContext } from '../item/NavigationMenuItemContext';
import { createTransitionStatus, type TransitionStatus } from '../../internals/createTransitionStatus';
import { createOpenChangeComplete } from '../../internals/createOpenChangeComplete';
import { transitionStatusMapping } from '../../internals/stateAttributesMapping';
import type { StateAttributesMapping } from '../../internals/getStateAttributesProps';
import { CompositeRoot } from '../../internals/composite/root/CompositeRoot';
import { popupStateMapping } from '../../utils/popupStateMapping';

const stateAttributesMapping: StateAttributesMapping<NavigationMenuContentState> = {
  ...popupStateMapping,
  ...transitionStatusMapping,
  activationDirection(value) {
    if (!value) {
      return null;
    }
    return {
      'data-activation-direction': value,
    };
  },
};

/**
 * A container for the content of the navigation menu item that is moved into the popup
 * when the item is active.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Navigation Menu](https://base-ui.com/react/components/navigation-menu)
 */
export function NavigationMenuContent(componentProps: NavigationMenuContent.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'ref',
    'keepMounted',
  ]);

  const keepMounted = () => componentProps.keepMounted ?? false;

  const {
    mounted: popupMounted,
    viewportElement,
    value,
    activationDirection,
    currentContentRef,
    viewportTargetElement,
  } = useNavigationMenuRootContext();
  const itemContext = useNavigationMenuItemContext();
  const nodeId = useNavigationMenuTreeContext();

  const open = () => popupMounted() && value() === itemContext.value;

  let contentElement: HTMLElement | null = null;

  const [hasMountedInPortal, setHasMountedInPortal] = useSignal(false, 'hasMountedInPortal');
  const [focusInside, setFocusInside] = useSignal(false, 'focusInside');

  const { mounted, setMounted, transitionStatus } = createTransitionStatus(open);

  // If the popup unmounts before the content's exit animation completes, reset the internal
  // mounted state so the next open can re-enter via `transitionStatus="starting"`.
  createEffect(() => {
    if (mounted() && !popupMounted()) {
      setMounted(false);
    }
  });

  createOpenChangeComplete({
    open,
    getElement: () => contentElement,
    onComplete() {
      if (!open()) {
        setMounted(false);
      }
    },
  });

  // When a content re-enters while still mounted (e.g. switching top-level triggers
  // back before the exit animation completes), the DOM element hasn't changed so the
  // callback ref won't fire again. Ensure the shared ref is updated so the
  // MutationObserver in the trigger watches the correct content element.
  createEffect(() => {
    if (open() && contentElement) {
      currentContentRef.current = contentElement;
    }
  });

  const state: NavigationMenuContentState = {
    get open() {
      return open();
    },
    get transitionStatus() {
      return transitionStatus();
    },
    get activationDirection() {
      return activationDirection();
    },
  };

  function handleCurrentContentRef(node: HTMLElement | null) {
    // Inactive `keepMounted` content also mounts in the viewport; only the
    // active content can own the shared sizing observer target.
    if (node && open()) {
      currentContentRef.current = node;
    }
  }

  const commonProps: HTMLProps<HTMLDivElement> = {
    onFocus(event: FocusEvent) {
      const target = getTarget(event) as Element | null;
      if (target?.hasAttribute('data-base-ui-focus-guard')) {
        return;
      }
      setFocusInside(true);
    },
    onBlur(event: FocusEvent) {
      if (!contains(event.currentTarget as Element, event.relatedTarget as Element | null)) {
        setFocusInside(false);
      }
    },
  };

  const defaultProps = (): HTMLProps =>
    !open() && mounted()
      ? {
          style: { position: 'absolute', top: 0, left: 0 },
          inert: inertValue(!focusInside()),
          ...commonProps,
        }
      : commonProps;

  const portalContainer = () => viewportTargetElement() || viewportElement();
  const hidden = () => keepMounted() && !mounted();
  const shouldRenderInline = () => keepMounted() && !portalContainer() && !hasMountedInPortal();

  createEffect(() => {
    if (keepMounted() && portalContainer() && !hasMountedInPortal()) {
      setHasMountedInPortal(true);
    }
  });

  return (
    <Show
      when={!shouldRenderInline()}
      fallback={
        <CompositeRoot<never, NavigationMenuContentState>
          defaultClass="wheel-NavigationMenu-Content"
          slot="navigation-menu-content"
          as={componentProps.as}
          asChild={componentProps.asChild}
          class={componentProps.class}
          style={componentProps.style}
          state={state}
          refs={[(el: any) => componentProps.ref?.(el)]}
          props={[defaultProps, { hidden: true }, elementProps]}
          stateAttributesMapping={stateAttributesMapping}
        >
          {componentProps.children}
        </CompositeRoot>
      }
    >
      <Show when={portalContainer() != null && (mounted() || keepMounted())}>
        <Portal mount={portalContainer()!}>
          <FloatingNode id={nodeId}>
            <CompositeRoot<never, NavigationMenuContentState>
              defaultClass="wheel-NavigationMenu-Content"
              slot="navigation-menu-content"
              as={componentProps.as}
              asChild={componentProps.asChild}
              class={componentProps.class}
              style={componentProps.style}
              state={state}
              refs={[
                (el: any) => componentProps.ref?.(el),
                (el: HTMLElement | null) => {
                  contentElement = el;
                },
                handleCurrentContentRef,
              ]}
              props={[defaultProps, () => (hidden() ? { hidden: true } : {}), elementProps]}
              stateAttributesMapping={stateAttributesMapping}
            >
              {componentProps.children}
            </CompositeRoot>
          </FloatingNode>
        </Portal>
      </Show>
    </Show>
  );
}

export interface NavigationMenuContentState {
  /**
   * If `true`, the component is open.
   */
  open: boolean;
  /**
   * The transition status of the component.
   */
  transitionStatus: TransitionStatus;
  /**
   * The direction of the activation.
   */
  activationDirection: 'left' | 'right' | 'up' | 'down' | null;
}

export interface NavigationMenuContentProps
  extends BaseUIComponentProps<'div', NavigationMenuContentState> {
  /**
   * Whether to keep the content mounted in the DOM while the popup is closed.
   * Ensures the content is present during server-side rendering for web crawlers.
   * @default false
   */
  keepMounted?: boolean | undefined;
}

export namespace NavigationMenuContent {
  export type State = NavigationMenuContentState;
  export type Props = NavigationMenuContentProps;
}
