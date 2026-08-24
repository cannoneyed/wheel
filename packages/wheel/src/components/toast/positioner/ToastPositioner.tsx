/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import { isElement } from '@floating-ui/utils/dom';
import { EMPTY_OBJECT } from '../../base-utils/empty';
import {
  useAnchorPositioning,
  type Side,
  type Align,
  type UseAnchorPositioningSharedParameters,
} from '../../utils/useAnchorPositioning';
import type { BaseUIComponentProps } from '../../internals/types';
import { POPUP_COLLISION_AVOIDANCE } from '../../internals/constants';
import { ToastPositionerContext } from './ToastPositionerContext';
import { useFloatingRootContext, FloatingNode, useFloatingNodeId } from '../../floating-ui-solid';
import { NOOP } from '../../internals/noop';
import type { ToastObject } from '../useToastManager';
import { ToastRootCssVars } from '../root/ToastRootCssVars';
import { useToastProviderContext } from '../provider/ToastProviderContext';
import { createPositioner } from '../../utils/createPositioner';

/**
 * Positions the toast against the anchor.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Toast](https://base-ui.com/react/components/toast)
 *
 * Deviation: the positioner is always "mounted" (upstream passes `mounted: true` /
 * `keepMounted: true` to `useAnchorPositioning` too) — unlike Popover/Tooltip, a toast's presence
 * in the DOM is governed by its membership in the store's `toasts` array, not by a separate
 * open/mounted boolean, so there's nothing to hide/inert here.
 */
export function ToastPositioner(componentProps: ToastPositioner.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'toast',
    'anchor',
    'positionMethod',
    'side',
    'align',
    'sideOffset',
    'alignOffset',
    'collisionBoundary',
    'collisionPadding',
    'arrowPadding',
    'sticky',
    'disableAnchorTracking',
    'collisionAvoidance',
  ]);

  const store = useToastProviderContext();
  const nodeId = useFloatingNodeId();

  const positionerProps = () => (local.toast.positionerProps ?? EMPTY_OBJECT) as NonNullable<
    typeof local.toast.positionerProps
  >;

  const anchorProp = () => local.anchor ?? positionerProps().anchor;
  const positionMethod = () => local.positionMethod ?? positionerProps().positionMethod ?? 'absolute';
  const side = () => local.side ?? positionerProps().side ?? 'top';
  const align = () => local.align ?? positionerProps().align ?? 'center';
  const sideOffset = () => local.sideOffset ?? positionerProps().sideOffset ?? 0;
  const alignOffset = () => local.alignOffset ?? positionerProps().alignOffset ?? 0;
  const collisionBoundary = () =>
    local.collisionBoundary ?? positionerProps().collisionBoundary ?? 'clipping-ancestors';
  const collisionPadding = () => local.collisionPadding ?? positionerProps().collisionPadding ?? 5;
  const arrowPadding = () => local.arrowPadding ?? positionerProps().arrowPadding ?? 5;
  const sticky = () => local.sticky ?? positionerProps().sticky ?? false;
  const disableAnchorTracking = () =>
    local.disableAnchorTracking ?? positionerProps().disableAnchorTracking ?? false;
  const collisionAvoidance = () =>
    local.collisionAvoidance ?? positionerProps().collisionAvoidance ?? POPUP_COLLISION_AVOIDANCE;

  let positionerElement: HTMLDivElement | null = null;
  const setPositionerElement = (el: HTMLDivElement | null) => {
    positionerElement = el;
  };

  const domIndex = store.useState('toastIndex', () => local.toast.id);
  const visibleIndex = store.useState('toastVisibleIndex', () => local.toast.id);

  const anchor = () => (isElement(anchorProp()) ? (anchorProp() as Element) : null);

  const floatingRootContext = useFloatingRootContext({
    open: () => true,
    onOpenChange: NOOP,
    elements: {
      floating: () => positionerElement,
      reference: anchor,
    },
  });

  const positioning = useAnchorPositioning({
    anchor,
    positionMethod,
    floatingRootContext,
    mounted: () => true,
    side,
    sideOffset,
    align,
    alignOffset,
    collisionBoundary,
    collisionPadding,
    sticky,
    arrowPadding,
    disableAnchorTracking,
    keepMounted: () => true,
    collisionAvoidance,
    nodeId,
  });

  const state: ToastPositionerState = {
    get side() {
      return positioning.side();
    },
    get align() {
      return positioning.align();
    },
    get anchorHidden() {
      return positioning.anchorHidden();
    },
  };

  return (
    <ToastPositionerContext.Provider value={positioning}>
      <FloatingNode id={nodeId}>
        {createPositioner(componentProps, state, {
          styles: () => ({
            ...positioning.positionerStyles(),
            [ToastRootCssVars.index as string]:
              local.toast.transitionStatus === 'ending' ? domIndex() : visibleIndex(),
          }),
          transitionStatus: () => local.toast.transitionStatus,
          props: elementProps,
          refs: [setPositionerElement],
        })}
      </FloatingNode>
    </ToastPositionerContext.Provider>
  );
}

export interface ToastPositionerState {
  /**
   * The side of the anchor the component is placed on.
   */
  side: Side;
  /**
   * The alignment of the component relative to the anchor.
   */
  align: Align;
  /**
   * Whether the anchor element is hidden.
   */
  anchorHidden: boolean;
}

export interface ToastPositionerProps
  extends BaseUIComponentProps<'div', ToastPositionerState>,
    Omit<UseAnchorPositioningSharedParameters, 'side' | 'anchor'> {
  /**
   * An element to position the toast against.
   */
  anchor?: Element | null | undefined;
  /**
   * Which side of the anchor element to align the toast against.
   * May automatically change to avoid collisions.
   * @default 'top'
   */
  side?: Side | undefined;
  /**
   * The toast object associated with the positioner.
   */
  toast: ToastObject<any>;
}

export namespace ToastPositioner {
  export type State = ToastPositionerState;
  export type Props = ToastPositionerProps;
}
