/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-use-signal -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createEffect, createSignal, splitProps, type JSX } from 'solid-js';
import { inertValue } from '../../base-utils/inertValue';
import { useSelectFloatingContext, useSelectRootContext } from '../root/SelectRootContext';
import { CompositeList } from '../../internals/composite/list/CompositeList';
import type { CompositeMetadata } from '../../internals/composite/list/CompositeList';
import type { BaseUIComponentProps } from '../../internals/types';
import {
  useAnchorPositioning,
  type Align,
  type Side,
  type UseAnchorPositioningSharedParameters,
} from '../../utils/useAnchorPositioning';
import { SelectPositionerContext } from './SelectPositionerContext';
import { InternalBackdrop } from '../../utils/InternalBackdrop';
import { DROPDOWN_COLLISION_AVOIDANCE } from '../../internals/constants';
import { clearStyles } from '../popup/utils';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import { findItemIndex, selectedValueIncludes } from '../../internals/itemEquality';
import { createPositioner } from '../../utils/createPositioner';
import { useAnchoredPopupScrollLock } from '../../utils/useAnchoredPopupScrollLock';

const FIXED: JSX.CSSProperties = { position: 'fixed' };

/**
 * Positions the select popup.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Select](https://base-ui.com/react/components/select)
 */
export function SelectPositioner(componentProps: SelectPositioner.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'anchor',
    'positionMethod',
    'side',
    'align',
    'sideOffset',
    'alignOffset',
    'collisionBoundary',
    'collisionPadding',
    'arrowPadding',
    'sticky',
    'disableAnchorTracking',
    'alignItemWithTrigger',
    'collisionAvoidance',
  ]);

  const {
    store,
    listRef,
    labelsRef,
    alignItemWithTriggerActiveRef,
    selectedItemTextRef,
    valuesRef,
    initialValueRef,
    popupRef,
    setValue,
  } = useSelectRootContext();
  const floatingRootContext = useSelectFloatingContext();

  const open = store.useState('open');
  const mounted = store.useState('mounted');
  const modal = store.useState('modal');
  const value = store.useState('value');
  const openMethod = store.useState('openMethod');
  const positionerElement = store.useState('positionerElement');
  const triggerElement = store.useState('triggerElement');
  const isItemEqualToValue = store.useState('isItemEqualToValue');
  const transitionStatus = store.useState('transitionStatus');

  const scrollUpArrowRef: { current: HTMLDivElement | null } = { current: null };
  const scrollDownArrowRef: { current: HTMLDivElement | null } = { current: null };

  const alignItemWithTrigger = () => local.alignItemWithTrigger ?? false;
  const [controlledAlignItemWithTrigger, setControlledAlignItemWithTrigger] = createSignal(
    alignItemWithTrigger(),
  );
  const alignItemWithTriggerActive = () =>
    mounted() && controlledAlignItemWithTrigger() && openMethod() !== 'touch';

  createEffect(() => {
    if (!mounted() && controlledAlignItemWithTrigger() !== alignItemWithTrigger()) {
      setControlledAlignItemWithTrigger(alignItemWithTrigger());
    }
  });

  createEffect(() => {
    if (!mounted()) {
      if (store.state.scrollUpArrowVisible) {
        store.set('scrollUpArrowVisible', false);
      }
      if (store.state.scrollDownArrowVisible) {
        store.set('scrollDownArrowVisible', false);
      }
    }
  });

  createEffect(() => {
    alignItemWithTriggerActiveRef.current = alignItemWithTriggerActive();
  });

  useAnchoredPopupScrollLock(
    () => (alignItemWithTriggerActive() || modal()) && open(),
    () => openMethod() === 'touch',
    positionerElement,
    triggerElement,
  );

  const positioning = useAnchorPositioning({
    anchor: () => local.anchor,
    floatingRootContext,
    positionMethod: () => local.positionMethod ?? 'absolute',
    mounted,
    side: () => local.side ?? 'bottom',
    sideOffset: () => local.sideOffset ?? 0,
    align: () => local.align ?? 'center',
    alignOffset: () => local.alignOffset ?? 0,
    arrowPadding: () => local.arrowPadding ?? 5,
    collisionBoundary: () => local.collisionBoundary ?? 'clipping-ancestors',
    collisionPadding: () => local.collisionPadding,
    sticky: () => local.sticky ?? false,
    disableAnchorTracking: () => local.disableAnchorTracking ?? alignItemWithTriggerActive(),
    collisionAvoidance: () => local.collisionAvoidance ?? DROPDOWN_COLLISION_AVOIDANCE,
    keepMounted: () => true,
  });

  const renderedSide = (): Side | 'none' => (alignItemWithTriggerActive() ? 'none' : positioning.side());
  const positionerStyles = () => (alignItemWithTriggerActive() ? FIXED : positioning.positionerStyles());

  const state: SelectPositioner.State = {
    get open() {
      return open();
    },
    get side() {
      return renderedSide();
    },
    get align() {
      return positioning.align();
    },
    get anchorHidden() {
      return positioning.anchorHidden();
    },
  };

  createEffect(() => {
    store.set('popupSide', positioning.side());
  });

  const prevMapSize = { current: 0 };

  const onMapChange = (map: Map<Element, CompositeMetadata<{ index?: number | null | undefined }> | null>) => {
    if (map.size === 0 && prevMapSize.current === 0) {
      return;
    }

    // Upstream checks `valuesRef.current.length === 0` — in React, item teardown clears the
    // array before this callback runs, so a closing popup skips the prune. In Solid, items
    // deregister one at a time by nulling their slot WITHOUT shrinking the array, so the
    // equivalent "registry is being torn down" signal is every slot being null. Without this,
    // closing the popup pruned the selected value against an all-null registry and reset it
    // to null (crashing function-children of `Select.Value` that assume a non-null value).
    if (valuesRef.current.every((itemValue) => itemValue == null)) {
      return;
    }

    const prevSize = prevMapSize.current;
    prevMapSize.current = map.size;

    if (map.size === prevSize) {
      return;
    }

    const eventDetails = createChangeEventDetails(REASONS.none);
    const comparer = isItemEqualToValue();
    const currentValue = value();

    if (prevSize !== 0 && !store.state.multiple && currentValue !== null) {
      const selectedValueIndex = findItemIndex(valuesRef.current, currentValue, comparer);
      if (selectedValueIndex === -1) {
        const initialSelectedValue = initialValueRef.current;
        const hasInitial =
          initialSelectedValue != null &&
          findItemIndex(valuesRef.current, initialSelectedValue, comparer) !== -1;
        const nextValue = hasInitial ? initialSelectedValue : null;
        setValue(nextValue, eventDetails);

        if (nextValue === null) {
          store.set('selectedIndex', null);
          selectedItemTextRef.current = null;
        }
      }
    }

    if (prevSize !== 0 && store.state.multiple && Array.isArray(currentValue)) {
      const hasVisibleItem = (selectedItemValue: unknown) =>
        findItemIndex(valuesRef.current, selectedItemValue, comparer) !== -1;
      const nextValue = currentValue.filter((selectedItemValue) => hasVisibleItem(selectedItemValue));
      if (
        nextValue.length !== currentValue.length ||
        nextValue.some(
          (selectedItemValue) => !selectedValueIncludes(currentValue, selectedItemValue, comparer),
        )
      ) {
        setValue(nextValue, eventDetails);

        if (nextValue.length === 0) {
          store.set('selectedIndex', null);
          selectedItemTextRef.current = null;
        }
      }
    }

    if (open() && alignItemWithTriggerActive()) {
      store.update({
        scrollUpArrowVisible: false,
        scrollDownArrowVisible: false,
      });

      clearStyles(positionerElement(), { height: '' });
      clearStyles(popupRef.current, { height: '' });
    }
  };

  const contextValue: SelectPositionerContext = {
    ...positioning,
    side: renderedSide,
    alignItemWithTriggerActive,
    setControlledAlignItemWithTrigger,
    scrollUpArrowRef,
    scrollDownArrowRef,
  };

  return (
    <CompositeList elements={listRef.current} labels={labelsRef.current} onMapChange={onMapChange}>
      <SelectPositionerContext.Provider value={contextValue}>
        {mounted() && modal() ? (
          <InternalBackdrop inert={inertValue(!open())} cutout={triggerElement()} />
        ) : null}
        {createPositioner(componentProps, state, {
          styles: positionerStyles,
          transitionStatus,
          props: elementProps,
          refs: (el: HTMLElement | null) => store.set('positionerElement', el),
          hidden: () => !mounted(),
          inert: () => !open(),
        })}
      </SelectPositionerContext.Provider>
    </CompositeList>
  );
}

export interface SelectPositionerState {
  /**
   * Whether the component is open.
   */
  open: boolean;
  /**
   * The side of the anchor the component is placed on.
   */
  side: Side | 'none';
  /**
   * The alignment of the component relative to the anchor.
   */
  align: Align;
  /**
   * Whether the anchor element is hidden.
   */
  anchorHidden: boolean;
}

export interface SelectPositionerProps
  extends UseAnchorPositioningSharedParameters,
    BaseUIComponentProps<'div', SelectPositionerState> {
  /**
   * Whether the positioner overlaps the trigger so the selected item's text is aligned with the
   * trigger's value text. This only applies to mouse input and is automatically disabled if there
   * is not enough space.
   * @default false
   */
  alignItemWithTrigger?: boolean | undefined;
}

export namespace SelectPositioner {
  export type State = SelectPositionerState;
  export type Props = SelectPositionerProps;
}
