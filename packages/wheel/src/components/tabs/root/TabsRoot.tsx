/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-use-signal -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
import { createEffect, createSignal, splitProps, type JSX } from 'solid-js';
import { createControllableSignal } from '../../base-utils/createControllableSignal';
import { renderElement } from '../../internals/renderElement';
import type { BaseUIComponentProps, Orientation as BaseOrientation } from '../../internals/types';
import { CompositeList, type CompositeMetadata } from '../../internals/composite/list/CompositeList';
import { TabsRootContext, type TabsRootContextValue } from './TabsRootContext';
import { tabsStateAttributesMapping } from '../stateAttributesMapping';
import type { TabsTab } from '../tab/TabsTab';
import type { TabsPanel } from '../panel/TabsPanel';
import {
  createChangeEventDetails,
  type BaseUIChangeEventDetails,
} from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';

/**
 * Groups the tabs and the corresponding panels.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Tabs](https://base-ui.com/react/components/tabs)
 */
export function TabsRoot(componentProps: TabsRoot.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'defaultValue',
    'onValueChange',
    'orientation',
    'value',
  ]);

  const orientation = () => componentProps.orientation ?? 'horizontal';
  const isControlled = () => componentProps.value !== undefined;

  // Track whether the user explicitly provided a defined `defaultValue` prop.
  // Used to determine if we should honor a disabled tab selection.
  // Read once, at setup time, matching upstream's one-shot destructuring default.
  const hasExplicitDefaultValueProp = componentProps.defaultValue !== undefined;
  const initialDefaultValue: TabsTab.Value =
    componentProps.defaultValue === undefined ? 0 : componentProps.defaultValue;

  const [value, setValue] = createControllableSignal<TabsTab.Value>({
    controlled: () => componentProps.value,
    default: initialDefaultValue,
    name: 'Tabs',
    state: 'value',
  });

  const [tabActivationDirection, setTabActivationDirection] =
    createSignal<TabsTab.ActivationDirection>('none');

  const [tabMap, setTabMap] = createSignal(
    new Map<Element, CompositeMetadata<TabsTab.Metadata> | null>(),
  );

  const [mountedTabPanels, setMountedTabPanels] = createSignal(
    new Map<TabsTab.Value | number, string>(),
  );

  const getTabElementBySelectedValue = (
    selectedValue: TabsTab.Value | undefined,
  ): HTMLElement | null => {
    if (selectedValue === undefined) {
      return null;
    }

    for (const [tabElement, tabMetadata] of tabMap().entries()) {
      if (tabMetadata != null && selectedValue === (tabMetadata.value ?? tabMetadata.index)) {
        return tabElement as HTMLElement;
      }
    }

    return null;
  };

  // get the `id` attribute of <Tabs.Tab> to set as the value of `aria-labelledby` on <Tabs.Panel>
  const getTabIdByPanelValue = (tabPanelValue: TabsTab.Value): string | undefined => {
    for (const tabMetadata of tabMap().values()) {
      if (tabPanelValue === tabMetadata?.value) {
        return tabMetadata?.id;
      }
    }
    return undefined;
  };

  // get the `id` attribute of <Tabs.Panel> to set as the value of `aria-controls` on <Tabs.Tab>
  const getTabPanelIdByValue = (tabValue: TabsTab.Value): string | undefined => {
    return mountedTabPanels().get(tabValue);
  };

  const registerMountedTabPanel = (panelValue: TabsTab.Value | number, panelId: string) => {
    setMountedTabPanels((prev) => {
      if (prev.get(panelValue) === panelId) {
        return prev;
      }

      const next = new Map(prev);
      next.set(panelValue, panelId);
      return next;
    });
  };

  const unregisterMountedTabPanel = (panelValue: TabsTab.Value | number, panelId: string) => {
    setMountedTabPanels((prev) => {
      if (!prev.has(panelValue) || prev.get(panelValue) !== panelId) {
        return prev;
      }

      const next = new Map(prev);
      next.delete(panelValue);
      return next;
    });
  };

  const notifyAutomaticValueChange = (
    nextValue: TabsTab.Value,
    reason: TabsRoot.ChangeEventReason,
  ) => {
    componentProps.onValueChange?.(
      nextValue,
      createChangeEventDetails(reason, undefined, undefined, {
        activationDirection: 'none' as TabsTab.ActivationDirection,
      }),
    );
  };

  const onValueChange = (newValue: TabsTab.Value, eventDetails: TabsRoot.ChangeEventDetails) => {
    const direction = computeActivationDirection(value(), newValue, orientation(), tabMap());

    eventDetails.activationDirection = direction;

    componentProps.onValueChange?.(newValue, eventDetails);

    if (eventDetails.isCanceled) {
      return;
    }

    setTabActivationDirection(direction);
    setValue(newValue);
  };

  // Implicit uncontrolled selections are still automatic changes, so notify
  // once when the tabs first register. Explicit defaults are treated as user-owned.
  let shouldNotifyInitialValueChange = !hasExplicitDefaultValueProp;
  // An explicit defaultValue can intentionally point at a disabled tab on mount.
  // Once that selection becomes valid, later disabled states should fall back.
  let shouldHonorDisabledDefaultValue = hasExplicitDefaultValueProp;
  let didRegisterTabs = false;
  let lastKnownTabElement: Element | undefined;

  function commitAutomaticValueChange(
    fallbackValue: TabsTab.Value,
    fallbackReason: TabsRoot.ChangeEventReason,
  ) {
    setValue(fallbackValue);
    // Automatic fallbacks are not directional transitions; reset the direction
    // alongside the value.
    setTabActivationDirection('none');
    notifyAutomaticValueChange(fallbackValue, fallbackReason);
    shouldNotifyInitialValueChange = false;
  }

  // Uncontrolled roots own automatic fallback. Controlled roots keep the exact
  // value supplied by the parent, even when that tab is disabled or missing.
  createEffect(() => {
    if (isControlled()) {
      return;
    }

    const map = tabMap();
    const currentValue = value();

    if (map.size === 0) {
      // A cleanup outside the root can remove tabs while keeping the previous
      // tabs connected. Don't treat that as removal.
      if (didRegisterTabs && currentValue !== null && !lastKnownTabElement?.isConnected) {
        commitAutomaticValueChange(null, REASONS.missing);
      }
      return;
    }

    didRegisterTabs = true;
    lastKnownTabElement = map.keys().next().value;

    let selectedTabMetadata: CompositeMetadata<TabsTab.Metadata> | undefined;
    let firstEnabledTabValue: TabsTab.Value | undefined;

    for (const tabMetadata of map.values()) {
      if (tabMetadata == null) {
        continue;
      }
      if (tabMetadata.value === currentValue) {
        selectedTabMetadata = tabMetadata;
      }
      if (firstEnabledTabValue === undefined && !tabMetadata.disabled) {
        firstEnabledTabValue = tabMetadata.value;
      }
    }

    const selectionIsDisabled = selectedTabMetadata?.disabled;
    const selectionIsMissing = selectedTabMetadata == null && currentValue !== null;

    if (!selectionIsDisabled && currentValue === initialDefaultValue) {
      shouldHonorDisabledDefaultValue = false;
    }

    if (
      shouldHonorDisabledDefaultValue &&
      selectionIsDisabled &&
      currentValue === initialDefaultValue
    ) {
      return;
    }

    const notifyInitial = shouldNotifyInitialValueChange;

    if (selectionIsDisabled || selectionIsMissing) {
      const fallbackValue = firstEnabledTabValue ?? null;

      if (currentValue === fallbackValue) {
        // Already at the fallback value; no commit or notification needed,
        // but record that the implicit-initial transition has resolved.
        shouldNotifyInitialValueChange = false;
        return;
      }

      let fallbackReason: TabsRoot.ChangeEventReason = REASONS.missing;

      if (notifyInitial) {
        fallbackReason = REASONS.initial;
      } else if (selectionIsDisabled) {
        fallbackReason = REASONS.disabled;
      }

      commitAutomaticValueChange(fallbackValue, fallbackReason);
      return;
    }

    if (notifyInitial && selectedTabMetadata != null) {
      notifyAutomaticValueChange(currentValue, REASONS.initial);
      shouldNotifyInitialValueChange = false;
    }
  });

  const tabsContextValue: TabsRootContextValue = {
    value,
    onValueChange,
    orientation,
    getTabElementBySelectedValue,
    getTabIdByPanelValue,
    getTabPanelIdByValue,
    registerMountedTabPanel,
    unregisterMountedTabPanel,
    setTabMap,
    tabActivationDirection,
  };

  const state: TabsRoot.State = {
    get orientation() {
      return orientation();
    },
    get tabActivationDirection() {
      return tabActivationDirection();
    },
  };

  const panelElements: Array<HTMLElement | null> = [];

  return (
    <TabsRootContext.Provider value={tabsContextValue}>
      <CompositeList<TabsPanel.Metadata> elements={panelElements}>
        {renderElement('div', componentProps, {
          defaultClass: 'wheel-Tabs-Root',
          slot: 'tabs-root',
          state,
          props: [elementProps as Record<string, any>],
          stateAttributesMapping: tabsStateAttributesMapping,
        })}
      </CompositeList>
    </TabsRootContext.Provider>
  );
}

function computeActivationDirection(
  oldValue: TabsTab.Value | null,
  newValue: TabsTab.Value | null,
  orientation: 'horizontal' | 'vertical',
  tabMap: Map<Element, CompositeMetadata<TabsTab.Metadata> | null>,
): TabsTab.ActivationDirection {
  if (oldValue == null || newValue == null) {
    return 'none';
  }

  let oldTab: HTMLElement | null = null;
  let newTab: HTMLElement | null = null;

  for (const [tabElement, tabMetadata] of tabMap.entries()) {
    if (tabMetadata == null) {
      continue;
    }

    const tabValue = tabMetadata.value ?? tabMetadata.index;
    if (oldValue === tabValue) {
      oldTab = tabElement as HTMLElement;
    }
    if (newValue === tabValue) {
      newTab = tabElement as HTMLElement;
    }
    if (oldTab != null && newTab != null) {
      break;
    }
  }

  if (oldTab == null || newTab == null) {
    // Fallback for dynamic tabs: when a tab element isn't registered yet
    // (e.g. added and selected in the same update), infer direction from
    // the values themselves. Works for comparable types (numbers, strings).
    if (
      oldTab !== newTab &&
      (typeof oldValue === 'number' || typeof oldValue === 'string') &&
      typeof oldValue === typeof newValue
    ) {
      if (orientation === 'horizontal') {
        return newValue > oldValue ? 'right' : 'left';
      }
      return newValue > oldValue ? 'down' : 'up';
    }
    return 'none';
  }

  const oldRect = oldTab.getBoundingClientRect();
  const newRect = newTab.getBoundingClientRect();

  if (orientation === 'horizontal') {
    if (newRect.left < oldRect.left) {
      return 'left';
    }
    if (newRect.left > oldRect.left) {
      return 'right';
    }
  } else {
    if (newRect.top < oldRect.top) {
      return 'up';
    }
    if (newRect.top > oldRect.top) {
      return 'down';
    }
  }

  return 'none';
}

export type TabsRootOrientation = BaseOrientation;

export interface TabsRootState {
  /**
   * The component orientation.
   */
  orientation: TabsRootOrientation;
  /**
   * The direction used for tab activation.
   */
  tabActivationDirection: TabsTab.ActivationDirection;
}

export interface TabsRootProps extends BaseUIComponentProps<'div', TabsRootState> {
  /**
   * The value of the currently active `Tab`. Use when the component is controlled.
   * When the value is `null`, no Tab will be active.
   */
  value?: TabsTab.Value | undefined;
  /**
   * The default value. Use when the component is not controlled.
   * When the value is `null`, no Tab will be active.
   * @default 0
   */
  defaultValue?: TabsTab.Value | undefined;
  /**
   * The component orientation (layout flow direction).
   * @default 'horizontal'
   */
  orientation?: TabsRoot.Orientation | undefined;
  /**
   * Callback invoked when new value is being set.
   *
   * The event `reason` is `'none'` for user-initiated changes, such as a click
   * or keyboard navigation; `'initial'` for the first automatic selection or
   * fallback in uncontrolled roots when `defaultValue` is omitted or
   * `undefined`, including when the implicit initial value is disabled or
   * missing; `'disabled'` for automatic fallback when the selected tab becomes
   * disabled in uncontrolled roots; or `'missing'` for automatic fallback when
   * the selected tab is removed, or when an explicit `defaultValue` never
   * matches a mounted tab in uncontrolled roots.
   *
   * For automatic changes, the selected value can be `null` when no enabled Tab
   * is available as a fallback.
   *
   * Automatic changes cannot be canceled; calling `eventDetails.cancel()` for
   * `'initial'`, `'disabled'`, or `'missing'` has no effect.
   */
  onValueChange?:
    | ((value: TabsTab.Value, eventDetails: TabsRoot.ChangeEventDetails) => void)
    | undefined;
}

export type TabsRootChangeEventReason =
  | typeof REASONS.none
  | typeof REASONS.disabled
  | typeof REASONS.missing
  | typeof REASONS.initial;
export type TabsRootChangeEventDetails = BaseUIChangeEventDetails<
  TabsRootChangeEventReason,
  { activationDirection: TabsTab.ActivationDirection }
>;

export namespace TabsRoot {
  export type State = TabsRootState;
  export type Props = TabsRootProps;
  export type Orientation = TabsRootOrientation;
  export type ChangeEventReason = TabsRootChangeEventReason;
  export type ChangeEventDetails = TabsRootChangeEventDetails;
}
