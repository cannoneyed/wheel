/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { Show, splitProps, type JSX } from 'solid-js';
import { usePopoverRootContext } from '../root/PopoverRootContext';
import { PopoverPositionerContext } from './PopoverPositionerContext';
import {
  useAnchorPositioning,
  type Align,
  type Side,
  type UseAnchorPositioningSharedParameters,
} from '../../utils/useAnchorPositioning';
import type { BaseUIComponentProps } from '../../internals/types';
import { usePopoverPortalContext } from '../portal/PopoverPortalContext';
import { POPUP_COLLISION_AVOIDANCE } from '../../internals/constants';
import { createPositioner } from '../../utils/createPositioner';
import { FloatingNode, useFloatingNodeId } from '../../floating-ui-solid';
import { InternalBackdrop } from '../../utils/InternalBackdrop';
import { useAnchoredPopupScrollLock } from '../../utils/useAnchoredPopupScrollLock';
import { REASONS } from '../../internals/reasons';

/**
 * Positions the popover against the trigger.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Popover](https://base-ui.com/react/components/popover)
 *
 * Deviation: upstream stashes the rendered `InternalBackdrop` element on
 * `store.context.internalBackdropRef`. Nothing else in the ported file set reads that ref, so it's
 * dropped here rather than adding unused plumbing (same rationale as `PopoverBackdrop`'s dropped
 * `backdropRef`).
 *
 * Deviation: upstream also threads a `hasViewport`-gated `adaptiveOrigin` middleware through here
 * for `Popover.Viewport`'s morphing-content animations, and briefly forces `instantType` to
 * `'trigger-change'` while the active trigger element changes (via `useAnimationsFinished`).
 * Neither is ported — `Popover.Viewport` itself isn't ported (see `index.parts.ts`) — so
 * `adaptiveOrigin` is always `undefined` and `instantType` never becomes `'trigger-change'` here.
 */
export function PopoverPositioner(componentProps: PopoverPositioner.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
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

  const store = usePopoverRootContext();
  const keepMounted = usePopoverPortalContext();
  const nodeId = useFloatingNodeId();

  const open = store.useState('open');
  const mounted = store.useState('mounted');
  const instantType = store.useState('instantType');
  const transitionStatus = store.useState('transitionStatus');
  const openChangeReason = store.useState('openChangeReason');
  const activeTriggerElement = store.useState('activeTriggerElement');
  const modal = store.useState('modal');
  const openMethod = store.useState('openMethod');
  const positionerElement = store.useState('positionerElement');

  const positioning = useAnchorPositioning({
    anchor: () => local.anchor,
    positionMethod: () => local.positionMethod ?? 'absolute',
    floatingRootContext: store.state.floatingRootContext,
    mounted,
    side: () => local.side ?? 'bottom',
    sideOffset: () => local.sideOffset ?? 0,
    align: () => local.align ?? 'center',
    alignOffset: () => local.alignOffset ?? 0,
    collisionBoundary: () => local.collisionBoundary ?? 'clipping-ancestors',
    collisionPadding: () => local.collisionPadding ?? 5,
    sticky: () => local.sticky ?? false,
    arrowPadding: () => local.arrowPadding ?? 5,
    disableAnchorTracking: () => local.disableAnchorTracking ?? false,
    keepMounted: () => keepMounted,
    nodeId,
    collisionAvoidance: () => local.collisionAvoidance ?? POPUP_COLLISION_AVOIDANCE,
    adaptiveOrigin: undefined,
  });

  const state: PopoverPositioner.State = {
    get open() {
      return open();
    },
    get side() {
      return positioning.side();
    },
    get align() {
      return positioning.align();
    },
    get anchorHidden() {
      return positioning.anchorHidden();
    },
    get instant() {
      return instantType();
    },
  };

  useAnchoredPopupScrollLock(
    () => open() && modal() === true && openChangeReason() !== REASONS.triggerHover,
    () => openMethod() === 'touch',
    positionerElement,
    activeTriggerElement,
  );

  const shouldRenderBackdrop = () =>
    mounted() && modal() === true && openChangeReason() !== REASONS.triggerHover;

  return (
    <PopoverPositionerContext.Provider value={positioning}>
      <Show when={shouldRenderBackdrop()}>
        <InternalBackdrop inert={!open()} cutout={activeTriggerElement()} />
      </Show>
      <FloatingNode id={nodeId}>
        {createPositioner(componentProps, state, {
          styles: positioning.positionerStyles,
          transitionStatus,
          props: elementProps,
          refs: (el) => store.set('positionerElement', el),
          hidden: () => !mounted(),
          inert: () => !open(),
        })}
      </FloatingNode>
    </PopoverPositionerContext.Provider>
  );
}

export interface PopoverPositionerState {
  /**
   * Whether the popover is currently open.
   */
  open: boolean;
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
  /**
   * Whether CSS transitions should be disabled.
   */
  instant: string | undefined;
}

export interface PopoverPositionerProps
  extends UseAnchorPositioningSharedParameters,
    BaseUIComponentProps<'div', PopoverPositionerState> {}

export namespace PopoverPositioner {
  export type State = PopoverPositionerState;
  export type Props = PopoverPositionerProps;
}
