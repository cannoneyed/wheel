/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext, type Accessor } from 'solid-js';
import type { CompositeMetadata } from '../../internals/composite/list/CompositeList';
import type { TabsTab } from '../tab/TabsTab';
import type { TabsRoot } from './TabsRoot';

export interface TabsRootContextValue {
  /**
   * The currently active tab's value.
   */
  value: Accessor<TabsTab.Value>;
  /**
   * Callback for setting new value.
   */
  onValueChange: (value: TabsTab.Value, eventDetails: TabsRoot.ChangeEventDetails) => void;
  /**
   * The component orientation (layout flow direction).
   */
  orientation: Accessor<'horizontal' | 'vertical'>;
  /**
   * Gets the element of the Tab with the given value.
   */
  getTabElementBySelectedValue: (selectedValue: TabsTab.Value | undefined) => HTMLElement | null;
  /**
   * Gets the `id` attribute of the Tab that corresponds to the given TabPanel value.
   */
  getTabIdByPanelValue: (panelValue: TabsTab.Value) => string | undefined;
  /**
   * Gets the `id` attribute of the TabPanel that corresponds to the given Tab value.
   */
  getTabPanelIdByValue: (tabValue: TabsTab.Value) => string | undefined;
  registerMountedTabPanel: (panelValue: TabsTab.Value | number, panelId: string) => void;
  unregisterMountedTabPanel: (panelValue: TabsTab.Value | number, panelId: string) => void;
  setTabMap: (map: Map<Element, CompositeMetadata<TabsTab.Metadata> | null>) => void;
  /**
   * The position of the active tab relative to the previously active tab.
   */
  tabActivationDirection: Accessor<TabsTab.ActivationDirection>;
}

/**
 * @internal
 */
export const TabsRootContext = createContext<TabsRootContextValue | undefined>(undefined);

export function useTabsRootContext(): TabsRootContextValue {
  const context = useContext(TabsRootContext);
  if (context === undefined) {
    throw new Error(
      'Base UI Solid: TabsRootContext is missing. Tabs parts must be placed within <Tabs.Root>.',
    );
  }

  return context;
}
