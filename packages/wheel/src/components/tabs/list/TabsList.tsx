/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-use-signal -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createEffect, onCleanup, createSignal, splitProps, type JSX } from 'solid-js';
import { EMPTY_ARRAY } from '../../base-utils/empty';
import type { BaseUIComponentProps, HTMLProps } from '../../internals/types';
import type { TabsRoot, TabsRootState } from '../root/TabsRoot';
import { CompositeRoot } from '../../internals/composite/root/CompositeRoot';
import { tabsStateAttributesMapping } from '../stateAttributesMapping';
import { useTabsRootContext } from '../root/TabsRootContext';
import type { TabsTab } from '../tab/TabsTab';
import { TabsListContext, type TabsListContextValue } from './TabsListContext';

/**
 * Groups the individual tab buttons.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Tabs](https://base-ui.com/react/components/tabs)
 */
export function TabsList(componentProps: TabsList.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, [
    'activateOnFocus',
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'loopFocus',
    'ref',
  ]);

  const activateOnFocus = () => componentProps.activateOnFocus ?? false;
  const loopFocus = () => componentProps.loopFocus ?? true;

  const { onValueChange, orientation, value, setTabMap, tabActivationDirection } =
    useTabsRootContext();

  const [highlightedTabIndex, setHighlightedTabIndex] = createSignal(0);
  const [tabsListElement, setTabsListElement] = createSignal<HTMLElement | null>(null);

  const indicatorUpdateListeners = new Set<() => void>();
  const tabResizeObserverElements = new Set<HTMLElement>();
  let resizeObserver: ResizeObserver | null = null;

  createEffect(() => {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(() => {
      indicatorUpdateListeners.forEach((listener) => {
        listener();
      });
    });

    resizeObserver = observer;

    const listElement = tabsListElement();
    if (listElement) {
      observer.observe(listElement);
    }

    tabResizeObserverElements.forEach((element) => {
      observer.observe(element);
    });

    onCleanup(() => {
      observer.disconnect();
      resizeObserver = null;
    });
  });

  const registerIndicatorUpdateListener = (listener: () => void) => {
    indicatorUpdateListeners.add(listener);
    return () => {
      indicatorUpdateListeners.delete(listener);
    };
  };

  const registerTabResizeObserverElement = (element: HTMLElement) => {
    tabResizeObserverElements.add(element);
    resizeObserver?.observe(element);
    return () => {
      tabResizeObserverElements.delete(element);
      resizeObserver?.unobserve(element);
    };
  };

  const onTabActivation = (
    newValue: TabsTab.Value,
    eventDetails: TabsRoot.ChangeEventDetails,
  ) => {
    if (newValue !== value()) {
      onValueChange(newValue, eventDetails);
    }
  };

  const state: TabsList.State = {
    get orientation() {
      return orientation();
    },
    get tabActivationDirection() {
      return tabActivationDirection();
    },
  };

  const defaultProps = (): HTMLProps => ({
    'aria-orientation': orientation() === 'vertical' ? 'vertical' : undefined,
    role: 'tablist',
  });

  const tabsListContextValue: TabsListContextValue = {
    activateOnFocus,
    highlightedTabIndex,
    registerIndicatorUpdateListener,
    registerTabResizeObserverElement,
    onTabActivation,
    setHighlightedTabIndex,
    tabsListElement,
  };

  return (
    <TabsListContext.Provider value={tabsListContextValue}>
      <CompositeRoot<TabsTab.Metadata, TabsList.State>
        defaultClass="wheel-Tabs-List"
        slot="tabs-list"
        as={componentProps.as}
        asChild={componentProps.asChild}
        class={componentProps.class}
        style={componentProps.style}
        state={state}
        refs={[componentProps.ref, setTabsListElement].filter(
          (ref): ref is (el: any) => void => typeof ref === 'function',
        )}
        props={[defaultProps, elementProps as HTMLProps]}
        stateAttributesMapping={tabsStateAttributesMapping}
        highlightedIndex={highlightedTabIndex()}
        enableHomeAndEndKeys
        loopFocus={loopFocus()}
        orientation={orientation()}
        onHighlightedIndexChange={setHighlightedTabIndex}
        onMapChange={setTabMap}
        disabledIndices={EMPTY_ARRAY as number[]}
      >
        {componentProps.children}
      </CompositeRoot>
    </TabsListContext.Provider>
  );
}

export interface TabsListState extends TabsRootState {}

export interface TabsListProps extends BaseUIComponentProps<'div', TabsListState> {
  /**
   * Whether to automatically change the active tab on arrow key focus.
   * Otherwise, tabs will be activated using <kbd>Enter</kbd> or <kbd>Space</kbd> key press.
   * @default false
   */
  activateOnFocus?: boolean | undefined;
  /**
   * Whether to loop keyboard focus back to the first item
   * when the end of the list is reached while using the arrow keys.
   * @default true
   */
  loopFocus?: boolean | undefined;
}

export namespace TabsList {
  export type State = TabsListState;
  export type Props = TabsListProps;
}
