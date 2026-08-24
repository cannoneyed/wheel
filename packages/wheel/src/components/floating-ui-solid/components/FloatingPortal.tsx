/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-use-signal, wheel/require-view-root -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import {
  createContext,
  createEffect,
  createSignal,
  createUniqueId,
  onCleanup,
  splitProps,
  Show,
  useContext,
  type Accessor,
  type JSX,
} from 'solid-js';
import { Portal } from 'solid-js/web';
import { EMPTY_OBJECT } from '../../base-utils/empty';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import { ownerVisuallyHidden } from '../../internals/constants';
import { renderElement, type RenderElementComponentProps } from '../../internals/renderElement';
import { access, type BaseUIComponentProps, type MaybeAccessor } from '../../internals/types';
import { FocusGuard } from '../../utils/FocusGuard';
import { createAttribute } from '../utils/createAttribute';
import {
  disableFocusInside,
  enableFocusInside,
  getNextTabbable,
  getPreviousTabbable,
  isOutsideEvent,
} from '../utils/tabbable';

type FocusManagerState = null | {
  modal: boolean;
  open: boolean;
  onOpenChange(open: boolean, data?: { reason?: string | undefined; event?: Event | undefined }): void;
  domReference: Element | null;
  closeOnFocusOut: boolean;
};

export interface PortalContextValue {
  /**
   * The portal's container DOM node. `null` until the container is resolved
   * and the wrapper `<div>` has mounted.
   */
  portalNode: Accessor<HTMLElement | null>;
  setFocusManagerState: (state: FocusManagerState) => void;
  beforeInsideRef: { current: HTMLSpanElement | null };
  afterInsideRef: { current: HTMLSpanElement | null };
  beforeOutsideRef: { current: HTMLSpanElement | null };
  afterOutsideRef: { current: HTMLSpanElement | null };
}

const PortalContext = createContext<PortalContextValue | null>(null);

/**
 * Consumed by `FloatingFocusManager` to coordinate focus guards with the
 * nearest ancestor `FloatingPortal`.
 * @internal
 */
export const usePortalContext = () => useContext(PortalContext);

const attr = createAttribute('portal');

export interface UseFloatingPortalNodeProps {
  ref?: ((el: HTMLDivElement) => void) | undefined;
  /**
   * A parent element (or shadow root) to render the portal element into.
   * `null` explicitly means "wait" (don't fall back to `document.body`/the
   * parent portal yet); `undefined` (the default) resolves to the nearest
   * ancestor portal node, or `document.body`.
   */
  container?: Accessor<HTMLElement | ShadowRoot | null | undefined> | undefined;
  componentProps?: RenderElementComponentProps<any> | undefined;
  elementProps?: Record<string, any> | undefined;
}

export interface UseFloatingPortalNodeResult {
  /**
   * The rendered wrapper `<div>`, once it has mounted into `containerElement`.
   */
  portalNode: Accessor<HTMLElement | null>;
  /**
   * The resolved container the wrapper `<div>` is portalled into.
   */
  containerElement: Accessor<HTMLElement | ShadowRoot | null>;
  /**
   * Renders the wrapper `<div>` element. Must be placed inside a
   * `<Portal mount={containerElement()}>` by the caller — unlike React,
   * where `useFloatingPortalNode` returns a ready-made `ReactPortal`, Solid's
   * `<Portal>` needs to be authored in JSX.
   */
  renderPortalElement: () => JSX.Element;
}

/**
 * Solid port of upstream's `useFloatingPortalNode`.
 *
 * Upstream re-resolves the container in a layout effect that watches
 * `containerProp`/`parentPortalNode` and clears/`setPortalNode(null)`s when
 * the container changes, so a fresh wrapper `<div>` is mounted into the new
 * container. The Solid port does the same via `createEffect`, reading the
 * (already-a-thunk) `container` accessor and the parent's `portalNode`
 * accessor reactively.
 */
export function useFloatingPortalNode(
  props: UseFloatingPortalNodeProps = {},
): UseFloatingPortalNodeResult {
  const componentProps = props.componentProps ?? EMPTY_OBJECT;

  const uniqueId = `base-ui-${createUniqueId()}`;
  const portalContext = usePortalContext();
  const parentPortalNode = () => portalContext?.portalNode() ?? null;

  const [containerElement, setContainerElement] = createSignal<HTMLElement | ShadowRoot | null>(
    null,
  );
  const [portalNode, setPortalNode] = createSignal<HTMLElement | null>(null);

  let containerRef: HTMLElement | ShadowRoot | null = null;

  createEffect(() => {
    const containerProp = access(props.container);

    // Wait for the container to be resolved if explicitly `null`.
    if (containerProp === null) {
      if (containerRef) {
        containerRef = null;
        setPortalNode(null);
        setContainerElement(null);
      }
      return;
    }

    const resolvedContainer =
      containerProp ??
      parentPortalNode() ??
      (typeof document === 'undefined' ? null : document.body);

    if (resolvedContainer == null) {
      if (containerRef) {
        containerRef = null;
        setPortalNode(null);
        setContainerElement(null);
      }
      return;
    }

    if (containerRef !== resolvedContainer) {
      containerRef = resolvedContainer;
      setPortalNode(null);
      setContainerElement(resolvedContainer);
    }
  });

  const setPortalNodeRef = (node: HTMLDivElement) => {
    setPortalNode(node);
    props.ref?.(node);
  };

  const renderPortalElement = () =>
    renderElement('div', componentProps, {
      ref: setPortalNodeRef,
      props: [
        {
          id: uniqueId,
          [attr]: '',
        },
        props.elementProps,
      ],
      // The wrapper `<div>` never renders `componentProps.children` itself —
      // upstream's `useRenderElement` doesn't surface it for the default
      // (non-`render`-prop) tag path either. The actual floating content is
      // portalled into this div separately once it mounts (see
      // `FloatingPortal`'s second `<Portal>`), so `renderElement`'s Solid-only
      // default of falling back to `componentProps.children` is overridden
      // here to avoid rendering it twice.
      children: () => undefined,
    });

  return {
    portalNode,
    containerElement,
    renderPortalElement,
  };
}

export interface FloatingPortalState {}

export namespace FloatingPortal {
  export type State = FloatingPortalState;
  export interface Props extends BaseUIComponentProps<'div', State> {
    /**
     * A parent element to render the portal element into.
     */
    container?: MaybeAccessor<HTMLElement | ShadowRoot | null | undefined> | undefined;
  }
}

/**
 * Portals the floating element into a given container element — by default,
 * outside of the app root and into the body.
 * This is necessary to ensure the floating element can appear outside any
 * potential parent containers that cause clipping (such as `overflow: hidden`),
 * while retaining its location in the component tree.
 * @see https://floating-ui.com/docs/FloatingPortal
 * @internal
 */
export function FloatingPortal(componentProps: FloatingPortal.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'container',
  ]);

  const { portalNode, containerElement, renderPortalElement } = useFloatingPortalNode({
    container: () => access(local.container),
    componentProps,
    elementProps,
  });

  const beforeOutsideRef: { current: HTMLSpanElement | null } = { current: null };
  const afterOutsideRef: { current: HTMLSpanElement | null } = { current: null };
  const beforeInsideRef: { current: HTMLSpanElement | null } = { current: null };
  const afterInsideRef: { current: HTMLSpanElement | null } = { current: null };

  const [focusManagerState, setFocusManagerState] = createSignal<FocusManagerState>(null);
  let focusInsideDisabled = false;

  const modal = () => focusManagerState()?.modal ?? false;
  const open = () => focusManagerState()?.open ?? false;

  const shouldRenderGuards = (): boolean => {
    const state = focusManagerState();
    return !!state && !state.modal && state.open && !!portalNode();
  };

  // https://codesandbox.io/s/tabbable-portal-f4tng?file=/src/TabbablePortal.tsx
  createEffect(() => {
    const node = portalNode();
    if (!node || modal()) {
      return;
    }

    // Make sure elements inside the portal element are tabbable only when the
    // portal has already been focused, either by tabbing into a focus trap
    // element outside or using the mouse.
    function onFocus(event: FocusEvent) {
      if (event.relatedTarget && isOutsideEvent(event)) {
        if (event.type === 'focusin') {
          if (focusInsideDisabled) {
            // `node` is narrowed non-null by the guard above, but TS control
            // flow analysis doesn't carry that through a nested function
            // declaration.
            enableFocusInside(node!);
            focusInsideDisabled = false;
          }
        } else {
          disableFocusInside(node!);
          focusInsideDisabled = true;
        }
      }
    }

    // Listen to the event on the capture phase so they run before the focus
    // trap elements' `onFocus` handler is called.
    node.addEventListener('focusin', onFocus, true);
    node.addEventListener('focusout', onFocus, true);
    onCleanup(() => {
      node.removeEventListener('focusin', onFocus, true);
      node.removeEventListener('focusout', onFocus, true);
    });
  });

  createEffect(() => {
    const node = portalNode();
    if (!node || open() !== true || !focusInsideDisabled) {
      return;
    }

    // Restore tabbability before the focus manager's queued focus-on-open step runs.
    enableFocusInside(node);
    focusInsideDisabled = false;
  });

  const portalContextValue: PortalContextValue = {
    portalNode,
    setFocusManagerState,
    beforeOutsideRef,
    afterOutsideRef,
    beforeInsideRef,
    afterInsideRef,
  };

  return (
    <>
      <Show when={containerElement()}>
        {(mount) => <Portal mount={mount()}>{renderPortalElement()}</Portal>}
      </Show>
      <PortalContext.Provider value={portalContextValue}>
        <Show when={shouldRenderGuards() && portalNode()}>
          {(node) => (
            <FocusGuard
              data-type="outside"
              ref={(el) => {
                beforeOutsideRef.current = el;
              }}
              onFocus={(event) => {
                if (isOutsideEvent(event, node())) {
                  beforeInsideRef.current?.focus();
                } else {
                  const domReference = focusManagerState()?.domReference ?? null;
                  const prevTabbable = getPreviousTabbable(domReference);
                  prevTabbable?.focus();
                }
              }}
            />
          )}
        </Show>
        <Show when={shouldRenderGuards() && portalNode()}>
          {(node) => <span aria-owns={node().id} style={ownerVisuallyHidden} />}
        </Show>
        <Show when={portalNode()}>
          {(node) => (
            <Portal mount={node()}>
              {
                // `FloatingPortal`'s `children` prop is typed to allow the
                // `asChild` render-function form (per `BaseUIComponentProps`),
                // but `FloatingPortal` itself doesn't support `asChild` for
                // the portalled content (only upstream's `render`/`as`
                // customization of the *wrapper* `<div>` makes sense here) —
                // narrow to the plain-JSX form actually used at call sites.
                local.children as JSX.Element
              }
            </Portal>
          )}
        </Show>
        <Show when={shouldRenderGuards() && portalNode()}>
          {(node) => (
            <FocusGuard
              data-type="outside"
              ref={(el) => {
                afterOutsideRef.current = el;
              }}
              onFocus={(event) => {
                if (isOutsideEvent(event, node())) {
                  afterInsideRef.current?.focus();
                } else {
                  const domReference = focusManagerState()?.domReference ?? null;
                  const nextTabbable = getNextTabbable(domReference);
                  nextTabbable?.focus();

                  const state = focusManagerState();
                  if (state?.closeOnFocusOut) {
                    state.onOpenChange(false, createChangeEventDetails(REASONS.focusOut, event));
                  }
                }
              }}
            />
          )}
        </Show>
      </PortalContext.Provider>
    </>
  );
}
