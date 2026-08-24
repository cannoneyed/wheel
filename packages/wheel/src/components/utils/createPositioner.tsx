import type { Accessor, JSX } from 'solid-js';
import { popupStateMapping } from './popupStateMapping';
import { getDisabledMountTransitionStyles } from './getDisabledMountTransitionStyles';
import { renderElement, type RenderElementComponentProps } from '../internals/renderElement';
import type { TransitionStatus } from '../internals/createTransitionStatus';

interface CreatePositionerOptions {
  defaultClass?: string | undefined;
  slot?: string | undefined;
  styles: Accessor<JSX.CSSProperties>;
  transitionStatus: Accessor<TransitionStatus>;
  props?: Record<string, any> | undefined;
  refs?: ((el: any) => void) | Array<((el: any) => void) | undefined> | undefined;
  hidden?: Accessor<boolean> | undefined;
  inert?: Accessor<boolean> | undefined;
}

/**
 * Renders the shared outer Positioner element used by popup components. Applies the common role,
 * hidden state, transition styles, state attributes, and optional inert styling.
 * Solid port of upstream's `usePositioner`.
 *
 * Deviation: `styles`/`transitionStatus`/`hidden`/`inert` are accessors here rather than plain
 * values — upstream's hook re-runs (and rebuilds these) every render, but `createPositioner` is
 * called once, so the reactive bits are read inside `renderElement`'s reactive props thunk instead.
 */
export function createPositioner<State extends Record<string, any>>(
  componentProps: RenderElementComponentProps<State>,
  state: State,
  { defaultClass, slot, styles, transitionStatus, props, refs, hidden, inert }: CreatePositionerOptions,
): JSX.Element {
  return renderElement('div', componentProps, {
    defaultClass,
    slot,
    state,
    ref: refs,
    props: [
      () => {
        const style: JSX.CSSProperties = { ...styles() };
        if (inert?.()) {
          (style as Record<string, any>)['pointer-events'] = 'none';
        }
        return { role: 'presentation', hidden: hidden?.(), style };
      },
      () => getDisabledMountTransitionStyles(transitionStatus()),
      props,
    ],
    stateAttributesMapping: popupStateMapping,
  });
}
