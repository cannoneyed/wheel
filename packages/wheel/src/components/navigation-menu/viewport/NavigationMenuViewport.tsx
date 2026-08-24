/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-tracked-show, wheel/require-view-root -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createEffect, splitProps, Show, type Accessor, type JSX } from 'solid-js';
import { inertValue } from '../../base-utils/inertValue';
import type { BaseUIComponentProps } from '../../internals/types';
import { renderElement } from '../../internals/renderElement';
import { useNavigationMenuRootContext } from '../root/NavigationMenuRootContext';
import { FocusGuard } from '../../utils/FocusGuard';
import {
  getNextTabbable,
  getPreviousTabbable,
  isOutsideEvent,
} from '../../floating-ui-solid/utils/tabbable';
import { contains } from '../../floating-ui-solid/utils/element';
import { createBaseUiId } from '../../internals/createBaseUiId';
import { useNavigationMenuPositionerContext } from '../positioner/NavigationMenuPositionerContext';

/**
 * Renders focus guards around `children`, unless neither a shared floating context nor an
 * ancestor Positioner is available yet (mirrors upstream's `Guards`).
 */
function ViewportGuards(props: {
  shouldRender: Accessor<boolean>;
  referenceElement: Accessor<HTMLElement | null>;
  beforeInsideRef: { current: HTMLSpanElement | null };
  afterInsideRef: { current: HTMLSpanElement | null };
  beforeOutsideRef: { current: HTMLSpanElement | null };
  afterOutsideRef: { current: HTMLSpanElement | null };
  children: JSX.Element;
}): JSX.Element {
  return (
    <Show when={props.shouldRender()} fallback={props.children}>
      <>
        <FocusGuard
          ref={(el) => {
            props.beforeInsideRef.current = el;
          }}
          onFocus={(event) => {
            const referenceElement = props.referenceElement();
            if (referenceElement && isOutsideEvent(event, referenceElement)) {
              getNextTabbable(referenceElement)?.focus();
            } else {
              props.beforeOutsideRef.current?.focus();
            }
          }}
        />
        {props.children}
        <FocusGuard
          ref={(el) => {
            props.afterInsideRef.current = el;
          }}
          onFocus={(event) => {
            const referenceElement = props.referenceElement();
            if (referenceElement && isOutsideEvent(event, referenceElement)) {
              getPreviousTabbable(referenceElement)?.focus();
            } else {
              props.afterOutsideRef.current?.focus();
            }
          }}
        />
      </>
    </Show>
  );
}

/**
 * The clipping viewport of the navigation menu's current content.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Navigation Menu](https://base-ui.com/react/components/navigation-menu)
 */
export function NavigationMenuViewport(componentProps: NavigationMenuViewport.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'ref',
    'id',
  ]);

  const id = createBaseUiId(() => componentProps.id);

  const {
    setViewportElement,
    setViewportTargetElement,
    floatingRootContext,
    positionerElement,
    viewportElement,
    prevTriggerElementRef,
    beforeInsideRef,
    afterInsideRef,
    beforeOutsideRef,
    afterOutsideRef,
    viewportInert,
    setViewportInert,
  } = useNavigationMenuRootContext();

  // Nested inline navigation menus (rendered directly inside a parent `Content` without their own
  // `Positioner`) reuse the parent's Positioner/Popup for layout; `hasPositioner` is a structural
  // fact about this component instance (whether an ancestor `<NavigationMenu.Positioner>` exists)
  // and never changes over its lifetime, so it's read once as a plain boolean rather than tracked.
  const positioning = useNavigationMenuPositionerContext(true);
  const hasPositioner = Boolean(positioning);

  const domReference = () => {
    const ctx = floatingRootContext();
    return ctx ? (ctx.state.domReferenceElement as Element | null) : null;
  };

  createEffect(() => {
    const dom = domReference();
    if (dom) {
      prevTriggerElementRef.current = dom;
    }
  });

  const referenceElement = () => positionerElement() || viewportElement();
  const shouldRenderGuards = () => Boolean(floatingRootContext()) || hasPositioner;

  const element = renderElement('div', componentProps, {
    defaultClass: 'wheel-NavigationMenu-Viewport',
    slot: 'navigation-menu-viewport',
    ref: setViewportElement,
    props: [
      () => ({
        id: id(),
        onBlur(event: FocusEvent) {
          const relatedTarget = event.relatedTarget as Element | null;
          const currentTarget = event.currentTarget as Element;

          // If focus is leaving the viewport and not going to the trigger, make it inert
          // to prevent a focus loop.
          if (
            relatedTarget &&
            !contains(currentTarget, relatedTarget) &&
            relatedTarget !== domReference()
          ) {
            setViewportInert(true);
          }
        },
        ...(!hasPositioner && viewportInert() ? { inert: inertValue(true) } : {}),
      }),
      elementProps,
    ],
    children: () =>
      hasPositioner ? (
        (componentProps.children as JSX.Element)
      ) : (
        <ViewportGuards
          shouldRender={shouldRenderGuards}
          referenceElement={referenceElement}
          beforeInsideRef={beforeInsideRef}
          afterInsideRef={afterInsideRef}
          beforeOutsideRef={beforeOutsideRef}
          afterOutsideRef={afterOutsideRef}
        >
          <div ref={setViewportTargetElement}>{componentProps.children as JSX.Element}</div>
        </ViewportGuards>
      ),
  });

  // `hasPositioner` is a structural fact about this component instance (never toggles after
  // mount), so branching with `<Show>` rather than a reactive condition is intentional.
  return (
    <Show when={hasPositioner} fallback={element}>
      <ViewportGuards
        shouldRender={shouldRenderGuards}
        referenceElement={referenceElement}
        beforeInsideRef={beforeInsideRef}
        afterInsideRef={afterInsideRef}
        beforeOutsideRef={beforeOutsideRef}
        afterOutsideRef={afterOutsideRef}
      >
        {element}
      </ViewportGuards>
    </Show>
  );
}

export interface NavigationMenuViewportState {}

export interface NavigationMenuViewportProps
  extends BaseUIComponentProps<'div', NavigationMenuViewportState> {}

export namespace NavigationMenuViewport {
  export type State = NavigationMenuViewportState;
  export type Props = NavigationMenuViewportProps;
}
