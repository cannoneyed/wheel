/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createEffect, onCleanup, splitProps, type JSX } from 'solid-js';
import { warn } from '../../base-utils/warn';
import { renderElement } from '../../internals/renderElement';
import type { BaseUIComponentProps } from '../../internals/types';
import { useCollapsibleRootContext } from '../root/CollapsibleRootContext';
import type { CollapsibleRootState } from '../root/CollapsibleRoot';
import { collapsibleStateAttributesMapping } from '../root/stateAttributesMapping';
import { createCollapsiblePanel } from './createCollapsiblePanel';
import { CollapsiblePanelCssVars } from './CollapsiblePanelCssVars';
import type { TransitionStatus } from '../../internals/createTransitionStatus';

/**
 * A panel with the collapsible contents.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Collapsible](https://base-ui.com/react/components/collapsible)
 */
export function CollapsiblePanel(componentProps: CollapsiblePanel.Props) {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'hiddenUntilFound',
    'keepMounted',
    'id',
  ]);

  if (process.env.NODE_ENV !== 'production') {
    createEffect(() => {
      if (componentProps.hiddenUntilFound && componentProps.keepMounted === false) {
        warn(
          'The `keepMounted={false}` prop on `Collapsible.Panel` is ignored when `hiddenUntilFound` is enabled, since the panel must remain mounted while closed.',
        );
      }
    });
  }

  const {
    mounted,
    onOpenChange,
    open,
    panelId,
    setMounted,
    setPanelIdState,
    setOpen,
    state: rootState,
    transitionStatus,
  } = useCollapsibleRootContext();

  const hiddenUntilFound = () => componentProps.hiddenUntilFound ?? false;
  const keepMounted = () => componentProps.keepMounted ?? false;

  createEffect(() => {
    const idValue = componentProps.id;
    if (idValue) {
      setPanelIdState(idValue);
      onCleanup(() => {
        setPanelIdState(undefined);
      });
    }
  });

  const panel = createCollapsiblePanel({
    hiddenUntilFound,
    id: panelId,
    keepMounted,
    mounted,
    onOpenChange,
    open,
    setMounted,
    setOpen,
    transitionStatus,
  });

  const panelState: CollapsiblePanel.State = {
    get open() {
      return rootState.open;
    },
    get disabled() {
      return rootState.disabled;
    },
    get transitionStatus() {
      return panel.transitionStatus();
    },
  };

  // Bypasses `renderElement`'s own `componentProps.style` resolution (which
  // always lets the consumer's `style` win) so the temporary
  // `animationName: 'none'` override applied below can still win after the
  // user's inline styles have been merged, matching upstream's
  // `{ ...componentProps, style: undefined }` + manual `resolveStyle` call.
  const componentPropsForRender = {
    get class() {
      return componentProps.class;
    },
    get as() {
      return componentProps.as;
    },
    get asChild() {
      return componentProps.asChild;
    },
    get children() {
      return componentProps.children;
    },
    get ref() {
      return componentProps.ref;
    },
    style: undefined,
  };

  return renderElement('div', componentPropsForRender, {
    defaultClass: 'wheel-Collapsible-Panel',
    slot: 'collapsible-panel',
    state: panelState,
    ref: panel.ref,
    props: [
      panel.props,
      () => ({
        style: {
          [CollapsiblePanelCssVars.collapsiblePanelHeight]:
            panel.height() === undefined ? 'auto' : `${panel.height()}px`,
          [CollapsiblePanelCssVars.collapsiblePanelWidth]:
            panel.width() === undefined ? 'auto' : `${panel.width()}px`,
        },
      }),
      elementProps as Record<string, any>,
      () => {
        const resolved = resolveStyleValue(componentProps.style, panelState);
        return resolved !== undefined ? { style: resolved } : undefined;
      },
      () =>
        panel.shouldPreventOpenAnimation() ? { style: { 'animation-name': 'none' } } : undefined,
    ],
    stateAttributesMapping: collapsibleStateAttributesMapping,
    enabled: panel.shouldRender,
  });
}

function resolveStyleValue(
  style:
    | JSX.CSSProperties
    | string
    | ((state: CollapsiblePanelState) => JSX.CSSProperties | string | undefined)
    | undefined,
  state: CollapsiblePanelState,
): JSX.CSSProperties | string | undefined {
  return typeof style === 'function' ? style(state) : style;
}

export interface CollapsiblePanelState extends CollapsibleRootState {
  /**
   * The transition status of the component.
   */
  transitionStatus: TransitionStatus;
}

export interface CollapsiblePanelProps extends BaseUIComponentProps<'div', CollapsiblePanelState> {
  /**
   * Allows the browser's built-in page search to find and expand the panel contents.
   *
   * Overrides the `keepMounted` prop and uses `hidden="until-found"`
   * to hide the element without removing it from the DOM.
   *
   * @default false
   */
  hiddenUntilFound?: boolean | undefined;
  /**
   * Whether to keep the element in the DOM while the panel is hidden.
   * This prop is ignored when `hiddenUntilFound` is used.
   * @default false
   */
  keepMounted?: boolean | undefined;
}

export namespace CollapsiblePanel {
  export type State = CollapsiblePanelState;
  export type Props = CollapsiblePanelProps;
}
