/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import { useTooltipRootContext } from '../root/TooltipRootContext';
import { TooltipPositionerContext } from './TooltipPositionerContext';
import {
  useAnchorPositioning,
  type Align,
  type Side,
  type UseAnchorPositioningSharedParameters,
} from '../../utils/useAnchorPositioning';
import type { BaseUIComponentProps } from '../../internals/types';
import { useTooltipPortalContext } from '../portal/TooltipPortalContext';
import { POPUP_COLLISION_AVOIDANCE } from '../../internals/constants';
import { createPositioner } from '../../utils/createPositioner';

/**
 * Positions the tooltip against the trigger.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Tooltip](https://base-ui.com/react/components/tooltip)
 *
 * Deviation: upstream also threads a `hasViewport`-gated `adaptiveOrigin` middleware through here
 * for `Tooltip.Viewport`'s morphing-content animations. `Tooltip.Viewport` is not ported (see
 * `tooltip/root/TooltipRoot.tsx`'s doc comment / the port's final report) — it's a separate,
 * substantial animation feature outside the behaviors this pass targets — so `adaptiveOrigin` is
 * always `undefined` here.
 */
export function TooltipPositioner(componentProps: TooltipPositioner.Props): JSX.Element {
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

  const store = useTooltipRootContext();
  const keepMounted = useTooltipPortalContext();

  const open = store.useState('open');
  const mounted = store.useState('mounted');
  const trackCursorAxis = store.useState('trackCursorAxis');
  const disableHoverablePopup = store.useState('disableHoverablePopup');
  const instantType = store.useState('instantType');
  const transitionStatus = store.useState('transitionStatus');

  const positioning = useAnchorPositioning({
    anchor: () => local.anchor,
    positionMethod: () => local.positionMethod ?? 'absolute',
    floatingRootContext: store.state.floatingRootContext,
    mounted,
    side: () => local.side ?? 'top',
    sideOffset: () => local.sideOffset ?? 0,
    align: () => local.align ?? 'center',
    alignOffset: () => local.alignOffset ?? 0,
    collisionBoundary: () => local.collisionBoundary ?? 'clipping-ancestors',
    collisionPadding: () => local.collisionPadding ?? 5,
    sticky: () => local.sticky ?? false,
    arrowPadding: () => local.arrowPadding ?? 5,
    disableAnchorTracking: () => local.disableAnchorTracking ?? false,
    keepMounted: () => keepMounted,
    collisionAvoidance: () => local.collisionAvoidance ?? POPUP_COLLISION_AVOIDANCE,
    adaptiveOrigin: undefined,
  });

  const state: TooltipPositioner.State = {
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
      return trackCursorAxis() !== 'none' ? 'tracking-cursor' : instantType();
    },
  };

  return (
    <TooltipPositionerContext.Provider value={positioning}>
      {createPositioner(componentProps, state, {
        styles: positioning.positionerStyles,
        transitionStatus,
        props: elementProps,
        refs: (el) => store.set('positionerElement', el),
        hidden: () => !mounted(),
        inert: () => !open() || trackCursorAxis() === 'both' || disableHoverablePopup(),
      })}
    </TooltipPositionerContext.Provider>
  );
}

export interface TooltipPositionerState {
  /**
   * Whether the tooltip is currently open.
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

export interface TooltipPositionerProps
  extends BaseUIComponentProps<'div', TooltipPositionerState>,
    Omit<UseAnchorPositioningSharedParameters, 'side'> {
  /**
   * Which side of the anchor element to align the popup against.
   * May automatically change to avoid collisions.
   * @default 'top'
   */
  side?: Side | undefined;
}

export namespace TooltipPositioner {
  export type State = TooltipPositionerState;
  export type Props = TooltipPositionerProps;
}
