/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createEffect, onCleanup, onMount, splitProps, type JSX } from 'solid-js';
import { ownerDocument } from '../../base-utils/owner';
import { renderElement } from '../../internals/renderElement';
import type { BaseUIComponentProps, NativeButtonProps, HTMLProps } from '../../internals/types';
import { createBaseUiId } from '../../internals/createBaseUiId';
import { createButton } from '../../internals/use-button/createButton';
import { ACTIVE_COMPOSITE_ITEM } from '../../internals/composite/constants';
import { createCompositeItem } from '../../internals/composite/item/createCompositeItem';
import type { TabsRoot } from '../root/TabsRoot';
import { useTabsRootContext } from '../root/TabsRootContext';
import { tabsStateAttributesMapping } from '../stateAttributesMapping';
import { useTabsListContext } from '../list/TabsListContext';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import { activeElement, contains } from '../../internals/shadowDom';

/**
 * An individual interactive tab button that toggles the corresponding panel.
 * Renders a `<button>` element.
 *
 * Documentation: [Base UI Tabs](https://base-ui.com/react/components/tabs)
 */
export function TabsTab(componentProps: TabsTab.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'disabled',
    'value',
    'id',
    'nativeButton',
  ]);

  const disabled = () => componentProps.disabled ?? false;
  const nativeButton = () => componentProps.nativeButton ?? true;

  const {
    value: activeTabValue,
    getTabPanelIdByValue,
    orientation,
    tabActivationDirection,
  } = useTabsRootContext();

  const {
    activateOnFocus,
    highlightedTabIndex,
    onTabActivation,
    registerTabResizeObserverElement,
    setHighlightedTabIndex,
    tabsListElement,
  } = useTabsListContext();

  const id = createBaseUiId(() => componentProps.id);

  const tabMetadata = () => ({
    disabled: disabled(),
    id: id(),
    value: componentProps.value,
  });

  const {
    compositeProps,
    compositeRef,
    index,
    // hook is used instead of the CompositeItem component
    // because the index is needed for Tab internals
  } = createCompositeItem<TabsTab.Metadata>({
    metadata: tabMetadata,
  });

  const active = () => componentProps.value === activeTabValue();

  let isNavigating = false;
  let tabElement: HTMLElement | null = null;

  const handleCaptureKeyDown = () => {
    isNavigating = true;
  };

  onMount(() => {
    if (!tabElement) {
      return;
    }

    // Solid has no built-in JSX capture-phase event prop; attach a native
    // capture listener directly so this runs before the composite root's
    // (bubble-phase) keydown handler processes arrow-key navigation.
    tabElement.addEventListener('keydown', handleCaptureKeyDown, { capture: true });
    onCleanup(() => {
      tabElement?.removeEventListener('keydown', handleCaptureKeyDown, { capture: true });
    });

    const unregister = registerTabResizeObserverElement(tabElement);
    onCleanup(unregister);
  });

  // Keep the highlighted item in sync with the currently active tab
  // when the value prop changes externally (controlled mode).
  createEffect(() => {
    const idx = index();
    const isActive = active();
    const currentHighlighted = highlightedTabIndex();
    const isDisabled = disabled();
    const listElement = tabsListElement();

    if (isNavigating) {
      isNavigating = false;
      return;
    }

    if (!(isActive && idx > -1 && currentHighlighted !== idx)) {
      return;
    }

    // If focus is currently within the tabs list, don't override the roving
    // focus highlight. This keeps keyboard navigation relative to the focused
    // item after an external/asynchronous selection change.
    if (listElement != null) {
      const activeEl = activeElement(ownerDocument(listElement));
      if (activeEl && contains(listElement, activeEl)) {
        return;
      }
    }

    // Don't highlight disabled tabs to prevent them from interfering with keyboard navigation.
    // Keyboard focus (tabIndex) should remain on an enabled tab even when a disabled tab is selected.
    if (!isDisabled) {
      setHighlightedTabIndex(idx);
    }
  });

  const { getButtonProps, buttonRef } = createButton({
    disabled,
    native: nativeButton,
    focusableWhenDisabled: () => true,
  });

  const tabPanelId = () => getTabPanelIdByValue(componentProps.value);

  let isPressing = false;
  let isMainButton = false;

  function onClick() {
    if (active() || disabled()) {
      return;
    }

    onTabActivation(
      componentProps.value,
      createChangeEventDetails(REASONS.none, undefined, undefined, {
        activationDirection: 'none' as TabsTab.ActivationDirection,
      }),
    );
  }

  function onFocus(event: FocusEvent) {
    if (active()) {
      return;
    }

    // Only highlight enabled tabs when focused (disabled tabs remain focusable via focusableWhenDisabled).
    if (index() > -1 && !disabled()) {
      setHighlightedTabIndex(index());
    }

    if (disabled()) {
      return;
    }

    if (
      activateOnFocus() &&
      (!isPressing || // keyboard or touch focus
        (isPressing && isMainButton)) // mouse focus
    ) {
      onTabActivation(
        componentProps.value,
        createChangeEventDetails(REASONS.none, event, undefined, {
          activationDirection: 'none' as TabsTab.ActivationDirection,
        }),
      );
    }
  }

  function onPointerDown(event: PointerEvent) {
    if (active() || disabled()) {
      return;
    }

    isPressing = true;

    function handlePointerUp() {
      isPressing = false;
      isMainButton = false;
    }

    if (!event.button || event.button === 0) {
      isMainButton = true;

      const doc = ownerDocument(event.currentTarget as Element);
      doc.addEventListener('pointerup', handlePointerUp, { once: true });
    }
  }

  const state: TabsTab.State = {
    get disabled() {
      return disabled();
    },
    get active() {
      return active();
    },
    get orientation() {
      return orientation();
    },
    get tabActivationDirection() {
      return tabActivationDirection();
    },
  };

  return renderElement('button', componentProps, {
    defaultClass: 'wheel-Tabs-Tab',
    slot: 'tabs-tab',
    state,
    ref: [
      buttonRef,
      compositeRef,
      (el: HTMLElement) => {
        tabElement = el;
      },
    ],
    props: [
      compositeProps,
      (): HTMLProps => ({
        role: 'tab',
        'aria-controls': tabPanelId(),
        'aria-selected': active(),
        id: id(),
        onClick,
        onFocus,
        onPointerDown,
        [ACTIVE_COMPOSITE_ITEM]: active() ? '' : undefined,
      }),
      elementProps as Record<string, any>,
      getButtonProps,
    ],
    stateAttributesMapping: tabsStateAttributesMapping,
  });
}

export type TabsTabValue = any;

export type TabsTabActivationDirection = 'left' | 'right' | 'up' | 'down' | 'none';

export interface TabsTabPosition {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface TabsTabSize {
  width: number;
  height: number;
}

export interface TabsTabMetadata {
  disabled: boolean;
  id: string | undefined;
  value: TabsTab.Value | undefined;
}

export interface TabsTabState {
  /**
   * Whether the component should ignore user interaction.
   */
  disabled: boolean;
  /**
   * Whether the component is active.
   */
  active: boolean;
  /**
   * The component orientation.
   */
  orientation: TabsRoot.Orientation;
  /**
   * The direction used for tab activation.
   */
  tabActivationDirection: TabsTab.ActivationDirection;
}

export interface TabsTabProps
  extends NativeButtonProps,
    BaseUIComponentProps<'button', TabsTabState> {
  /**
   * The value of the Tab.
   */
  value: TabsTab.Value;
  /**
   * Whether the Tab is disabled.
   *
   * If a first Tab on a `<Tabs.List>` is disabled, it won't initially be selected.
   * Instead, the next enabled Tab will be selected.
   */
  disabled?: boolean | undefined;
}

export namespace TabsTab {
  export type Value = TabsTabValue;
  export type ActivationDirection = TabsTabActivationDirection;
  export type Position = TabsTabPosition;
  export type Size = TabsTabSize;
  export type Metadata = TabsTabMetadata;
  export type State = TabsTabState;
  export type Props = TabsTabProps;
}
