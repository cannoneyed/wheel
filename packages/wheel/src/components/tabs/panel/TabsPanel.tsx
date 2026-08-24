/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createEffect, onCleanup, splitProps, type JSX } from 'solid-js';
import { inertValue } from '../../base-utils/inertValue';
import { renderElement } from '../../internals/renderElement';
import type { BaseUIComponentProps, HTMLProps } from '../../internals/types';
import { createBaseUiId } from '../../internals/createBaseUiId';
import type { StateAttributesMapping } from '../../internals/getStateAttributesProps';
import { transitionStatusMapping } from '../../internals/stateAttributesMapping';
import { createOpenChangeComplete } from '../../internals/createOpenChangeComplete';
import { createTransitionStatus, type TransitionStatus } from '../../internals/createTransitionStatus';
import { createCompositeListItem } from '../../internals/composite/list/createCompositeListItem';
import { tabsStateAttributesMapping } from '../stateAttributesMapping';
import { useTabsRootContext } from '../root/TabsRootContext';
import type { TabsRootState } from '../root/TabsRoot';
import type { TabsTab } from '../tab/TabsTab';

const stateAttributesMapping: StateAttributesMapping<TabsPanelState> = {
  ...tabsStateAttributesMapping,
  ...transitionStatusMapping,
};

/**
 * A panel displayed when the corresponding tab is active.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Tabs](https://base-ui.com/react/components/tabs)
 */
export function TabsPanel(componentProps: TabsPanel.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'value',
    'keepMounted',
  ]);

  const keepMounted = () => componentProps.keepMounted ?? false;

  const {
    value: selectedValue,
    getTabIdByPanelValue,
    orientation,
    tabActivationDirection,
    registerMountedTabPanel,
    unregisterMountedTabPanel,
  } = useTabsRootContext();

  const id = createBaseUiId();

  const metadata = () => ({
    id: id(),
    value: componentProps.value,
  });

  const { ref: listItemRef, index } = createCompositeListItem<TabsPanel.Metadata>({
    metadata,
  });

  const open = () => componentProps.value === selectedValue();
  const { mounted, transitionStatus, setMounted } = createTransitionStatus(open);
  const hidden = () => !mounted();

  const correspondingTabId = () => getTabIdByPanelValue(componentProps.value);

  const state: TabsPanel.State = {
    get hidden() {
      return hidden();
    },
    get orientation() {
      return orientation();
    },
    get tabActivationDirection() {
      return tabActivationDirection();
    },
    get transitionStatus() {
      return transitionStatus();
    },
  };

  let panelRef: HTMLElement | null = null;

  createOpenChangeComplete({
    open,
    getElement: () => panelRef,
    onComplete() {
      if (!open()) {
        setMounted(false);
      }
    },
  });

  createEffect(() => {
    const isHidden = hidden();
    const shouldKeepMounted = keepMounted();
    const panelId = id();
    const value = componentProps.value;

    if (isHidden && !shouldKeepMounted) {
      return;
    }

    if (panelId == null) {
      return;
    }

    registerMountedTabPanel(value, panelId);
    onCleanup(() => {
      unregisterMountedTabPanel(value, panelId);
    });
  });

  const shouldRender = () => keepMounted() || mounted();

  return renderElement('div', componentProps, {
    defaultClass: 'wheel-Tabs-Panel',
    slot: 'tabs-panel',
    state,
    ref: [
      listItemRef,
      (el: HTMLElement) => {
        panelRef = el;
      },
    ],
    props: [
      (): HTMLProps => ({
        'aria-labelledby': correspondingTabId(),
        hidden: hidden(),
        id: id(),
        role: 'tabpanel',
        tabIndex: open() ? 0 : -1,
        inert: inertValue(!open()),
        'data-index': index(),
      }),
      elementProps as Record<string, any>,
    ],
    stateAttributesMapping,
    enabled: shouldRender,
  });
}

export interface TabsPanelMetadata {
  id?: string | undefined;
  value: TabsTab.Value;
}

export interface TabsPanelState extends TabsRootState {
  /**
   * Whether the component is hidden.
   */
  hidden: boolean;
  /**
   * The transition status of the component.
   */
  transitionStatus: TransitionStatus;
}

export interface TabsPanelProps extends BaseUIComponentProps<'div', TabsPanelState> {
  /**
   * The value of the TabPanel. It will be shown when the Tab with the corresponding value is active.
   */
  value: TabsTab.Value;
  /**
   * Whether to keep the HTML element in the DOM while the panel is hidden.
   * @default false
   */
  keepMounted?: boolean | undefined;
}

export namespace TabsPanel {
  export type Metadata = TabsPanelMetadata;
  export type State = TabsPanelState;
  export type Props = TabsPanelProps;
}
