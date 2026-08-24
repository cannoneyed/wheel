/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createEffect, onCleanup, splitProps, type JSX } from 'solid-js';
import { warn } from '../../base-utils/warn';
import { renderElement } from '../../internals/renderElement';
import type { BaseUIComponentProps } from '../../internals/types';
import { useCollapsibleRootContext } from '../../collapsible/root/CollapsibleRootContext';
import { createCollapsiblePanel } from '../../collapsible/panel/createCollapsiblePanel';
import { useAccordionRootContext } from '../root/AccordionRootContext';
import type { AccordionRoot } from '../root/AccordionRoot';
import type { AccordionItemState } from '../item/AccordionItem';
import { useAccordionItemContext } from '../item/AccordionItemContext';
import { accordionStateAttributesMapping } from '../item/stateAttributesMapping';
import { AccordionPanelCssVars } from './AccordionPanelCssVars';
import type { TransitionStatus } from '../../internals/createTransitionStatus';

/**
 * A collapsible panel with the accordion item contents.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Accordion](https://base-ui.com/react/components/accordion)
 */
export function AccordionPanel(componentProps: AccordionPanel.Props): JSX.Element {
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

  const { hiddenUntilFound: contextHiddenUntilFound, keepMounted: contextKeepMounted } =
    useAccordionRootContext();

  const {
    mounted,
    onOpenChange,
    open,
    panelId,
    setMounted,
    setOpen,
    setPanelIdState,
    transitionStatus,
  } = useCollapsibleRootContext();

  const hiddenUntilFound = () => componentProps.hiddenUntilFound ?? contextHiddenUntilFound();
  const keepMounted = () => componentProps.keepMounted ?? contextKeepMounted();

  if (process.env.NODE_ENV !== 'production') {
    createEffect(() => {
      if (componentProps.keepMounted === false && hiddenUntilFound()) {
        warn(
          'The `keepMounted={false}` prop on an `Accordion.Panel` is ignored when `hiddenUntilFound` is enabled on the panel or root, since the panel must remain mounted while closed.',
        );
      }
    });
  }

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

  const { state: itemState, triggerId } = useAccordionItemContext();

  const panelState: AccordionPanel.State = {
    get value() {
      return itemState.value;
    },
    get disabled() {
      return itemState.disabled;
    },
    get orientation() {
      return itemState.orientation;
    },
    get hidden() {
      return itemState.hidden;
    },
    get index() {
      return itemState.index;
    },
    get open() {
      return itemState.open;
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
    defaultClass: 'wheel-Accordion-Panel',
    slot: 'accordion-panel',
    state: panelState,
    ref: panel.ref,
    props: [
      panel.props,
      () => ({
        'aria-labelledby': triggerId(),
        role: 'region',
        style: {
          [AccordionPanelCssVars.accordionPanelHeight]:
            panel.height() === undefined ? 'auto' : `${panel.height()}px`,
          [AccordionPanelCssVars.accordionPanelWidth]:
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
    stateAttributesMapping: accordionStateAttributesMapping,
    enabled: panel.shouldRender,
  });
}

function resolveStyleValue(
  style:
    | JSX.CSSProperties
    | string
    | ((state: AccordionPanelState) => JSX.CSSProperties | string | undefined)
    | undefined,
  state: AccordionPanelState,
): JSX.CSSProperties | string | undefined {
  return typeof style === 'function' ? style(state) : style;
}

export interface AccordionPanelState extends AccordionItemState {
  /**
   * The transition status of the component.
   */
  transitionStatus: TransitionStatus;
}

export interface AccordionPanelProps
  extends BaseUIComponentProps<'div', AccordionPanelState>,
    Pick<AccordionRoot.Props, 'hiddenUntilFound' | 'keepMounted'> {}

export namespace AccordionPanel {
  export type State = AccordionPanelState;
  export type Props = AccordionPanelProps;
}
