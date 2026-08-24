/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createEffect, splitProps, type JSX } from 'solid-js';
import { FloatingFocusManager } from '../../floating-ui-solid/components/FloatingFocusManager';
import type { InteractionType } from '../../floating-ui-solid/components/FloatingFocusManager';
import type { BaseUIComponentProps } from '../../internals/types';
import { useComboboxFloatingContext, useComboboxRootContext } from '../root/ComboboxRootContext';
import { useFilteredItems } from '../root/utils/useFilteredItems';
import { getComboboxPopupId } from '../root/utils';
import { popupStateMapping } from '../../utils/popupStateMapping';
import { useComboboxPositionerContext } from '../positioner/ComboboxPositionerContext';
import type { Align, Side } from '../../utils/useAnchorPositioning';
import { createOpenChangeComplete } from '../../internals/createOpenChangeComplete';
import type { TransitionStatus } from '../../internals/createTransitionStatus';
import { transitionStatusMapping } from '../../internals/stateAttributesMapping';
import type { StateAttributesMapping } from '../../internals/getStateAttributesProps';
import { contains, getTarget } from '../../floating-ui-solid';
import { getDisabledMountTransitionStyles } from '../../utils/getDisabledMountTransitionStyles';
import { ComboboxInternalDismissButton } from '../utils/ComboboxInternalDismissButton';
import { renderElement } from '../../internals/renderElement';

const stateAttributesMapping: StateAttributesMapping<ComboboxPopupState> = {
  ...popupStateMapping,
  ...transitionStatusMapping,
};

/**
 * A container for the list.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Combobox](https://base-ui.com/react/components/combobox)
 */
export function ComboboxPopup(componentProps: ComboboxPopup.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'initialFocus',
    'finalFocus',
  ]);

  const store = useComboboxRootContext();
  const positioning = useComboboxPositionerContext();
  const floatingRootContext = useComboboxFloatingContext();
  const filteredItems = useFilteredItems();

  const mounted = store.useState('mounted');
  const open = store.useState('open');
  const openMethod = store.useState('openMethod');
  const transitionStatus = store.useState('transitionStatus');
  const inputInsidePopup = store.useState('inputInsidePopup');
  const inputElement = store.useState('inputElement');
  const modal = store.useState('modal');
  const rootId = store.useState('id');

  const empty = () => filteredItems().length === 0;
  const popupId = () =>
    (elementProps as Record<string, any>).id ?? (inputInsidePopup() ? getComboboxPopupId(rootId()) : undefined);

  createEffect(() => {
    store.set('popupId', store.context.popupRef.current?.id || popupId());
  });

  createOpenChangeComplete({
    open,
    getElement: () => store.context.popupRef.current,
    onComplete() {
      if (open()) {
        store.context.onOpenChangeComplete(true);
      }
    },
  });

  const state: ComboboxPopup.State = {
    get open() {
      return open();
    },
    get side() {
      return positioning.side();
    },
    get align() {
      return positioning.align();
    },
    get anchorHidden() {
      return positioning.anchorHidden();
    },
    get transitionStatus() {
      return transitionStatus();
    },
    get empty() {
      return empty();
    },
  };

  const element = renderElement('div', componentProps, {
    defaultClass: 'wheel-Combobox-Popup',
    slot: 'combobox-popup',
    state,
    ref: (el: HTMLElement | null) => {
      store.context.popupRef.current = el as HTMLDivElement | null;
    },
    props: [
      () => ({
        id: popupId(),
        role: inputInsidePopup() ? 'dialog' : 'presentation',
        tabIndex: -1,
        onFocus(event: FocusEvent) {
          const target = getTarget(event) as Element | null;
          if (
            openMethod() !== 'touch' &&
            (contains(store.state.listElement, target) || target === event.currentTarget)
          ) {
            store.context.inputRef.current?.focus();
          }
        },
      }),
      () => getDisabledMountTransitionStyles(transitionStatus()),
      elementProps,
    ],
    stateAttributesMapping,
  });

  const computedDefaultInitialFocus = (interactionType: InteractionType) =>
    inputInsidePopup()
      ? interactionType === 'touch'
        ? store.context.popupRef.current
        : inputElement()
      : false;

  const resolvedInitialFocus = () =>
    local.initialFocus === undefined ? computedDefaultInitialFocus : local.initialFocus;

  const resolvedFinalFocus = () => {
    if (local.finalFocus != null) {
      return local.finalFocus;
    }
    return inputInsidePopup() ? undefined : false;
  };

  const focusManagerModal = () => !inputInsidePopup() || modal();

  return (
    <FloatingFocusManager
      context={floatingRootContext}
      disabled={!mounted()}
      modal={focusManagerModal()}
      openInteractionType={openMethod()}
      initialFocus={resolvedInitialFocus() as any}
      returnFocus={resolvedFinalFocus() as any}
      getInsideElements={() => [
        store.context.startDismissRef.current,
        store.context.endDismissRef.current,
      ]}
    >
      <>
        {element}
        {focusManagerModal() && (
          <ComboboxInternalDismissButton
            ref={(el) => {
              store.context.endDismissRef.current = el;
            }}
          />
        )}
      </>
    </FloatingFocusManager>
  );
}

export interface ComboboxPopupState {
  /**
   * Whether the component is open.
   */
  open: boolean;
  /**
   * The side of the anchor the component is placed on.
   */
  side: Side;
  /**
   * The alignment of the component relative to the anchor.
   */
  align: Align;
  /**
   * Whether the anchor element is hidden.
   */
  anchorHidden: boolean;
  /**
   * The transition status of the component.
   */
  transitionStatus: TransitionStatus;
  /**
   * Whether there are no items to display.
   */
  empty: boolean;
}

export interface ComboboxPopupProps extends BaseUIComponentProps<'div', ComboboxPopupState> {
  /**
   * Determines the element to focus when the popup is opened.
   */
  initialFocus?:
    | boolean
    | { current: HTMLElement | null }
    | ((openType: InteractionType) => void | boolean | HTMLElement | null)
    | undefined;
  /**
   * Determines the element to focus when the popup is closed.
   */
  finalFocus?:
    | boolean
    | { current: HTMLElement | null }
    | ((closeType: InteractionType) => void | boolean | HTMLElement | null)
    | undefined;
}

export namespace ComboboxPopup {
  export type State = ComboboxPopupState;
  export type Props = ComboboxPopupProps;
}
