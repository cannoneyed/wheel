/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-use-signal -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createSignal, onCleanup, onMount, splitProps, type JSX } from 'solid-js';
import { renderElement } from '../../internals/renderElement';
import { getCssDimensions } from '../../utils/getCssDimensions';
import type { BaseUIComponentProps, HTMLProps } from '../../internals/types';
import type { TabsRoot, TabsRootState } from '../root/TabsRoot';
import { useTabsRootContext } from '../root/TabsRootContext';
import { tabsStateAttributesMapping } from '../stateAttributesMapping';
import { useTabsListContext } from '../list/TabsListContext';
import type { TabsTab } from '../tab/TabsTab';
import { TabsIndicatorCssVars } from './TabsIndicatorCssVars';

const stateAttributesMapping = {
  ...tabsStateAttributesMapping,
  activeTabPosition: () => null,
  activeTabSize: () => null,
};

/**
 * A visual indicator that can be styled to match the position of the currently active tab.
 * Renders a `<span>` element.
 *
 * Documentation: [Base UI Tabs](https://base-ui.com/react/components/tabs)
 */
export function TabsIndicator(componentProps: TabsIndicator.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, ['class', 'style', 'as', 'asChild', 'children']);

  const { getTabElementBySelectedValue, orientation, tabActivationDirection, value } =
    useTabsRootContext();

  const { tabsListElement, registerIndicatorUpdateListener } = useTabsListContext();

  // Upstream forces a re-render via `useForcedRerendering` whenever the tabs
  // list notifies of a layout change (e.g. a `ResizeObserver` entry). Solid
  // has no render-cycle concept to force; a tick signal read inside the
  // position computation below achieves the same "recompute on notify" effect.
  const [tick, setTick] = createSignal(0);

  onMount(() => {
    const unregister = registerIndicatorUpdateListener(() => setTick((t) => t + 1));
    onCleanup(unregister);
  });

  const computePosition = () => {
    tick();

    let left = 0;
    let right = 0;
    let top = 0;
    let bottom = 0;
    let width = 0;
    let height = 0;

    let isTabSelected = false;

    const currentValue = value();
    const listElement = tabsListElement();

    if (currentValue != null && listElement != null) {
      const activeTab = getTabElementBySelectedValue(currentValue);

      if (activeTab != null) {
        isTabSelected = true;

        const { width: computedWidth, height: computedHeight } = getCssDimensions(activeTab);
        const { width: tabListWidth, height: tabListHeight } = getCssDimensions(listElement);
        const tabRect = activeTab.getBoundingClientRect();
        const tabsListRect = listElement.getBoundingClientRect();
        const scaleX = tabListWidth > 0 ? tabsListRect.width / tabListWidth : 1;
        const scaleY = tabListHeight > 0 ? tabsListRect.height / tabListHeight : 1;
        const hasNonZeroScale =
          Math.abs(scaleX) > Number.EPSILON && Math.abs(scaleY) > Number.EPSILON;

        if (hasNonZeroScale) {
          const tabLeftDelta = tabRect.left - tabsListRect.left;
          const tabTopDelta = tabRect.top - tabsListRect.top;

          left = tabLeftDelta / scaleX + listElement.scrollLeft - listElement.clientLeft;
          top = tabTopDelta / scaleY + listElement.scrollTop - listElement.clientTop;
        } else {
          left = activeTab.offsetLeft;
          top = activeTab.offsetTop;
        }

        width = computedWidth;
        height = computedHeight;
        right = listElement.scrollWidth - left - width;
        bottom = listElement.scrollHeight - top - height;
      }
    }

    return { left, right, top, bottom, width, height, isTabSelected };
  };

  const activeTabPosition = (): TabsTab.Position | null => {
    const position = computePosition();
    return position.isTabSelected
      ? { left: position.left, right: position.right, top: position.top, bottom: position.bottom }
      : null;
  };

  const activeTabSize = (): TabsTab.Size | null => {
    const position = computePosition();
    return position.isTabSelected ? { width: position.width, height: position.height } : null;
  };

  const indicatorStyle = (): JSX.CSSProperties | undefined => {
    const position = computePosition();
    if (!position.isTabSelected) {
      return undefined;
    }
    return {
      [TabsIndicatorCssVars.activeTabLeft]: `${position.left}px`,
      [TabsIndicatorCssVars.activeTabRight]: `${position.right}px`,
      [TabsIndicatorCssVars.activeTabTop]: `${position.top}px`,
      [TabsIndicatorCssVars.activeTabBottom]: `${position.bottom}px`,
      [TabsIndicatorCssVars.activeTabWidth]: `${position.width}px`,
      [TabsIndicatorCssVars.activeTabHeight]: `${position.height}px`,
    } as JSX.CSSProperties;
  };

  const displayIndicator = () => {
    const position = computePosition();
    return position.isTabSelected && position.width > 0 && position.height > 0;
  };

  const state: TabsIndicator.State = {
    get orientation() {
      return orientation();
    },
    get activeTabPosition() {
      return activeTabPosition();
    },
    get activeTabSize() {
      return activeTabSize();
    },
    get tabActivationDirection() {
      return tabActivationDirection();
    },
  };

  return renderElement('span', componentProps, {
    defaultClass: 'wheel-Tabs-Indicator',
    slot: 'tabs-indicator',
    state,
    props: [
      (): HTMLProps => ({
        role: 'presentation',
        style: indicatorStyle(),
        // do not display the indicator before the layout is settled
        hidden: !displayIndicator(),
      }),
      elementProps as Record<string, any>,
    ],
    stateAttributesMapping,
    enabled: () => value() != null,
  });
}

export interface TabsIndicatorState extends TabsRootState {
  /**
   * The active tab position.
   */
  activeTabPosition: TabsTab.Position | null;
  /**
   * The active tab size.
   */
  activeTabSize: TabsTab.Size | null;
  /**
   * The component orientation.
   */
  orientation: TabsRoot.Orientation;
}

export interface TabsIndicatorProps extends BaseUIComponentProps<'span', TabsIndicatorState> {}

export namespace TabsIndicator {
  export type State = TabsIndicatorState;
  export type Props = TabsIndicatorProps;
}
