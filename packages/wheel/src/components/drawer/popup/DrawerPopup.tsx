/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { useSignal } from '../../../core/local-state';
import { createEffect, onCleanup, splitProps, type JSX } from 'solid-js';
import { error } from '../../base-utils/error';
import { EMPTY_OBJECT } from '../../base-utils/empty';
import { useDrawerRootContext } from '../root/DrawerRootContext';
import { renderElement } from '../../internals/renderElement';
import type { BaseUIComponentProps } from '../../internals/types';
import type { TransitionStatus } from '../../internals/createTransitionStatus';
import { createOpenChangeComplete } from '../../internals/createOpenChangeComplete';
import { COMPOSITE_KEYS } from '../../internals/composite/composite';
import { FloatingFocusManager, type InteractionType } from '../../floating-ui-solid/components/FloatingFocusManager';
import { FOCUSABLE_POPUP_PROPS } from '../../utils/popups';
import { useDrawerPortalContext } from '../portal/DrawerPortalContext';
import { getSnapPointSwipeMovement, useDrawerSnapPoints } from '../root/useDrawerSnapPoints';
import { useDrawerViewportContext } from '../viewport/DrawerViewportContext';
import { DrawerPopupCssVars } from './DrawerPopupCssVars';
import { DrawerBackdropCssVars } from '../backdrop/DrawerBackdropCssVars';
import { drawerPopupStateAttributesMapping } from './stateAttributesMapping';
import type { DrawerSwipeDirection } from '../store/DrawerStore';

// Module-level flag to ensure we only register the CSS properties once,
// regardless of how many Drawer components are mounted.
let drawerSwipeVarsRegistered = false;

/**
 * Removes inheritance of high-frequency drawer swipe CSS variables, which
 * reduces style recalculation cost in complex drawers with deep subtrees.
 * See https://motion.dev/blog/web-animation-performance-tier-list
 * under the "Improving CSS variable performance" section.
 */
function removeCSSVariableInheritance() {
  if (drawerSwipeVarsRegistered) {
    return;
  }

  if (typeof CSS !== 'undefined' && 'registerProperty' in CSS) {
    [
      DrawerPopupCssVars.swipeMovementX,
      DrawerPopupCssVars.swipeMovementY,
      DrawerPopupCssVars.snapPointOffset,
    ].forEach((name) => {
      try {
        CSS.registerProperty({
          name,
          syntax: '<length>',
          inherits: false,
          initialValue: '0px',
        });
      } catch {
        /* ignore already-registered */
      }
    });

    [
      { name: DrawerBackdropCssVars.swipeProgress, initialValue: '0' },
      { name: DrawerPopupCssVars.swipeStrength, initialValue: '1' },
    ].forEach(({ name, initialValue }) => {
      try {
        CSS.registerProperty({
          name,
          syntax: '<number>',
          inherits: false,
          initialValue,
        });
      } catch {
        /* ignore already-registered */
      }
    });
  }

  drawerSwipeVarsRegistered = true;
}

/**
 * A container for the drawer contents.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Drawer](https://base-ui.com/react/components/drawer)
 */
export function DrawerPopup(componentProps: DrawerPopup.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'id',
    'finalFocus',
    'initialFocus',
  ]);

  const store = useDrawerRootContext();

  const descriptionElementId = store.useState('descriptionElementId');
  const disablePointerDismissal = store.useState('disablePointerDismissal');
  const floatingRootContext = store.state.floatingRootContext;
  const rootPopupProps = store.useState('popupProps');
  const modal = store.useState('modal');
  const mounted = store.useState('mounted');
  const nested = store.useState('nested');
  const nestedOpenDrawerCount = store.useState('nestedOpenDrawerCount');
  const transitionStatus = store.useState('transitionStatus');
  const open = store.useState('open');
  const openMethod = store.useState('openMethod');
  const titleElementId = store.useState('titleElementId');
  const role = store.useState('role');
  const swipeDirection = store.useState('swipeDirection');
  const frontmostHeight = store.useState('frontmostHeight');
  const hasNestedDrawer = store.useState('hasNestedDrawer');
  const nestedSwiping = store.useState('nestedSwiping');
  const nestedSwipeProgress = store.useState('nestedSwipeProgress');
  const floatingId = floatingRootContext.useState('floatingId');

  const popupId = () => local.id ?? floatingId();

  const swipe = useDrawerViewportContext(true);
  // Throws if not rendered within a `<Drawer.Portal>` — matches upstream.
  useDrawerPortalContext();
  const { snapPoints, activeSnapPoint, activeSnapPointOffset } = useDrawerSnapPoints();

  const nestedDrawerOpen = () => nestedOpenDrawerCount() > 0;
  const swiping = () => swipe?.swiping ?? false;
  const swipeStrength = () => swipe?.swipeStrength ?? null;

  if (process.env.NODE_ENV !== 'production') {
    createEffect(() => {
      if (swipe) {
        return;
      }

      error(
        '<Drawer.Popup> expected to be rendered within <Drawer.Viewport>. Omitting the ' +
          'viewport disables drawer swipe handling and touch scroll locking. Wrap ' +
          '<Drawer.Popup> in <Drawer.Viewport>.',
      );
    });
  }

  const [popupHeight, setPopupHeight] = useSignal(0, 'popupHeight');
  let popupHeightValue = 0;

  function measureHeight() {
    const popupElement = store.context.popupRef.current;
    if (!popupElement) {
      return;
    }

    const offsetHeight = popupElement.offsetHeight;

    // Only skip while the element is still actually stretched beyond its last measured height.
    if (
      popupHeightValue > 0 &&
      frontmostHeight() > popupHeightValue &&
      offsetHeight > popupHeightValue
    ) {
      return;
    }

    const keepHeightWhileNested = popupHeightValue > 0 && hasNestedDrawer();
    if (keepHeightWhileNested) {
      setPopupHeight(popupHeightValue);
      store.set('popupHeight', popupHeightValue);
      return;
    }

    const nextHeight = offsetHeight;
    if (nextHeight === popupHeightValue) {
      return;
    }

    popupHeightValue = nextHeight;
    setPopupHeight(nextHeight);
    store.set('popupHeight', nextHeight);
  }

  createEffect(() => {
    const isMounted = mounted();
    // Tracked so this reruns when nested-drawer presence changes, matching upstream's dependency
    // array.
    nestedDrawerOpen();

    if (!isMounted) {
      popupHeightValue = 0;
      setPopupHeight(0);
      store.set('popupHeight', 0);
      return;
    }

    const popupElement = store.context.popupRef.current;
    if (!popupElement) {
      return;
    }

    removeCSSVariableInheritance();
    measureHeight();

    if (typeof ResizeObserver !== 'function') {
      return;
    }

    const resizeObserver = new ResizeObserver(measureHeight);
    resizeObserver.observe(popupElement);
    onCleanup(() => {
      resizeObserver.disconnect();
    });
  });

  // Reflects a nested drawer's reported swipe progress onto this popup's own backdrop-swipe-progress
  // CSS var, matching upstream's `nestedSwipeProgressStore` subscription.
  createEffect(() => {
    const popupElement = store.context.popupRef.current;
    if (!popupElement) {
      return;
    }

    const progress = nestedSwipeProgress();
    if (progress > 0) {
      popupElement.style.setProperty(DrawerBackdropCssVars.swipeProgress, `${progress}`);
    } else {
      popupElement.style.setProperty(DrawerBackdropCssVars.swipeProgress, '0');
    }

    onCleanup(() => {
      popupElement.style.setProperty(DrawerBackdropCssVars.swipeProgress, '0');
    });
  });

  createEffect(() => {
    const isOpen = open();
    const height = frontmostHeight();
    if (!isOpen) {
      return;
    }

    store.context.parentStore?.context.onNestedFrontmostHeightChange?.(height);

    onCleanup(() => {
      store.context.parentStore?.context.onNestedFrontmostHeightChange?.(0);
    });
  });

  createEffect(() => {
    const present = open() || transitionStatus() === 'ending';
    store.context.parentStore?.context.onNestedDrawerPresenceChange?.(present);

    onCleanup(() => {
      store.context.parentStore?.context.onNestedDrawerPresenceChange?.(false);
    });
  });

  createOpenChangeComplete({
    open,
    getElement: () => store.context.popupRef.current,
    onComplete() {
      if (open()) {
        store.context.onOpenChangeComplete?.(true);
      }
    },
  });

  const resolvedInitialFocus = () => {
    if (local.initialFocus !== undefined) {
      return local.initialFocus;
    }
    return store.context.popupRef;
  };

  const state: DrawerPopup.State = {
    get open() {
      return open();
    },
    get nested() {
      return nested();
    },
    get transitionStatus() {
      return transitionStatus();
    },
    get expanded() {
      return activeSnapPoint() === 1;
    },
    get nestedDrawerOpen() {
      return nestedDrawerOpen();
    },
    get nestedDrawerSwiping() {
      return nestedSwiping();
    },
    get swipeDirection() {
      return swipeDirection();
    },
    get swiping() {
      return swiping();
    },
  };

  const shouldUseAutoHeight = () => !hasNestedDrawer() && transitionStatus() !== 'ending';
  const popupHeightCssVarValue = () => {
    const height = popupHeight();
    return height && !shouldUseAutoHeight() ? `${height}px` : undefined;
  };

  const shouldApplySnapPoints = () => {
    const points = snapPoints();
    const direction = swipeDirection();
    return Boolean(points && points.length > 0 && (direction === 'down' || direction === 'up'));
  };

  const snapPointOffsetValue = () => {
    if (!shouldApplySnapPoints()) {
      return null;
    }
    const offset = activeSnapPointOffset();
    if (offset === null) {
      return null;
    }
    return swipeDirection() === 'up' ? -offset : offset;
  };

  const dragStyles = (): Record<string, any> => {
    const base: Record<string, any> = swipe ? swipe.getDragStyles() : EMPTY_OBJECT;
    if (!shouldApplySnapPoints() || swipeDirection() !== 'down') {
      return base;
    }

    const baseOffset = activeSnapPointOffset() ?? 0;
    const movementValue = Number.parseFloat(
      String((base as Record<string, string>)[DrawerPopupCssVars.swipeMovementY] ?? 0),
    );

    if (swiping() && Number.isFinite(movementValue)) {
      return {
        ...base,
        transform: undefined,
        [DrawerPopupCssVars.swipeMovementY]: `${getSnapPointSwipeMovement(baseOffset, movementValue)}px`,
      };
    }

    return { ...base, transform: undefined };
  };

  const element = renderElement('div', componentProps, {
    defaultClass: 'wheel-Drawer-Popup',
    slot: 'drawer-popup',
    state,
    props: [
      rootPopupProps,
      () => ({
        id: popupId(),
        'aria-labelledby': titleElementId() ?? undefined,
        'aria-describedby': descriptionElementId() ?? undefined,
        role: role(),
        ...FOCUSABLE_POPUP_PROPS,
        hidden: !mounted(),
        onKeyDown(event: KeyboardEvent) {
          if (COMPOSITE_KEYS.has(event.key)) {
            event.stopPropagation();
          }
        },
        style: {
          ...dragStyles(),
          [DrawerBackdropCssVars.swipeProgress]: '0',
          [DrawerPopupCssVars.nestedDrawers]: nestedOpenDrawerCount(),
          [DrawerPopupCssVars.height]: popupHeightCssVarValue(),
          [DrawerPopupCssVars.snapPointOffset]: `${snapPointOffsetValue() ?? 0}px`,
          [DrawerPopupCssVars.frontmostHeight]: frontmostHeight() ? `${frontmostHeight()}px` : undefined,
          [DrawerPopupCssVars.swipeStrength]:
            typeof swipeStrength() === 'number' && Number.isFinite(swipeStrength()) && (swipeStrength() as number) > 0
              ? `${swipeStrength()}`
              : '1',
        },
      }),
      elementProps,
    ],
    ref: (el: HTMLElement | null) => {
      store.context.popupRef.current = el;
      store.set('popupElement', el);
    },
    stateAttributesMapping: drawerPopupStateAttributesMapping,
  });

  return (
    <FloatingFocusManager
      context={floatingRootContext}
      openInteractionType={openMethod()}
      disabled={!mounted()}
      closeOnFocusOut={!disablePointerDismissal()}
      initialFocus={resolvedInitialFocus()}
      returnFocus={local.finalFocus}
      modal={modal() !== false}
      restoreFocus="popup"
    >
      {element}
    </FloatingFocusManager>
  );
}

export interface DrawerPopupProps extends BaseUIComponentProps<'div', DrawerPopupState> {
  /**
   * Determines the element to focus when the drawer is opened.
   */
  initialFocus?:
    | boolean
    | { current: HTMLElement | null }
    | ((openType: InteractionType) => boolean | HTMLElement | null | void)
    | undefined;
  /**
   * Determines the element to focus when the drawer is closed.
   */
  finalFocus?:
    | boolean
    | { current: HTMLElement | null }
    | ((closeType: InteractionType) => boolean | HTMLElement | null | void)
    | undefined;
}

export interface DrawerPopupState {
  /**
   * Whether the drawer is currently open.
   */
  open: boolean;
  /**
   * The transition status of the component.
   */
  transitionStatus: TransitionStatus;
  /**
   * Whether the active snap point is the full-height expanded state.
   */
  expanded: boolean;
  /**
   * Whether the drawer is nested within a parent drawer.
   */
  nested: boolean;
  /**
   * Whether the drawer has nested drawers open.
   */
  nestedDrawerOpen: boolean;
  /**
   * Whether a nested drawer is currently being swiped.
   */
  nestedDrawerSwiping: boolean;
  /**
   * The swipe direction used to dismiss the drawer.
   */
  swipeDirection: DrawerSwipeDirection;
  /**
   * Whether the drawer is being swiped.
   */
  swiping: boolean;
}

export namespace DrawerPopup {
  export type Props = DrawerPopupProps;
  export type State = DrawerPopupState;
}
