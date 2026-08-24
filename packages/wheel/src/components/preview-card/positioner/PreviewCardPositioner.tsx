/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import { usePreviewCardRootContext } from '../root/PreviewCardContext';
import { PreviewCardPositionerContext } from './PreviewCardPositionerContext';
import {
  useAnchorPositioning,
  type Align,
  type Side,
  type UseAnchorPositioningSharedParameters,
} from '../../utils/useAnchorPositioning';
import type { BaseUIComponentProps } from '../../internals/types';
import { usePreviewCardPortalContext } from '../portal/PreviewCardPortalContext';
import { POPUP_COLLISION_AVOIDANCE } from '../../internals/constants';
import { createPositioner } from '../../utils/createPositioner';
import { FloatingNode, useFloatingNodeId } from '../../floating-ui-solid';

/**
 * Positions the popup against the trigger.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Preview Card](https://base-ui.com/react/components/preview-card)
 *
 * Deviation: upstream also threads a `hasViewport`-gated `adaptiveOrigin` middleware and a custom
 * `inline` middleware (keeping the popup pinned to the exact hovered line of a wrapped, multi-line
 * trigger link) through here. Neither is ported — see `PreviewCardStore`'s doc comment for why.
 * `adaptiveOrigin` is always `undefined` and the popup anchors to the trigger's
 * `getBoundingClientRect()` (Floating UI's default), which is correct for single-line triggers.
 */
export function PreviewCardPositioner(componentProps: PreviewCardPositioner.Props): JSX.Element {
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

  const store = usePreviewCardRootContext();
  const keepMounted = usePreviewCardPortalContext();
  const nodeId = useFloatingNodeId();

  const open = store.useState('open');
  const mounted = store.useState('mounted');
  const instantType = store.useState('instantType');
  const transitionStatus = store.useState('transitionStatus');

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

  const state: PreviewCardPositioner.State = {
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

  return (
    <PreviewCardPositionerContext.Provider value={positioning}>
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
    </PreviewCardPositionerContext.Provider>
  );
}

export interface PreviewCardPositionerState {
  /**
   * Whether the preview card is currently open.
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
   * Whether transitions should be skipped.
   */
  instant: 'dismiss' | 'focus' | undefined;
}

export interface PreviewCardPositionerProps
  extends UseAnchorPositioningSharedParameters,
    BaseUIComponentProps<'div', PreviewCardPositionerState> {}

export namespace PreviewCardPositioner {
  export type State = PreviewCardPositionerState;
  export type Props = PreviewCardPositionerProps;
}
