/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext, type Accessor } from 'solid-js';
import type { TabsRoot } from '../root/TabsRoot';
import type { TabsTab } from '../tab/TabsTab';

export interface TabsListContextValue {
  activateOnFocus: Accessor<boolean>;
  highlightedTabIndex: Accessor<number>;
  registerIndicatorUpdateListener: (listener: () => void) => () => void;
  registerTabResizeObserverElement: (element: HTMLElement) => () => void;
  onTabActivation: (newValue: TabsTab.Value, eventDetails: TabsRoot.ChangeEventDetails) => void;
  setHighlightedTabIndex: (index: number) => void;
  tabsListElement: Accessor<HTMLElement | null>;
}

/**
 * @internal
 */
export const TabsListContext = createContext<TabsListContextValue | undefined>(undefined);

export function useTabsListContext(): TabsListContextValue {
  const context = useContext(TabsListContext);
  if (context === undefined) {
    throw new Error(
      'Base UI Solid: TabsListContext is missing. TabsList parts must be placed within <Tabs.List>.',
    );
  }

  return context;
}
