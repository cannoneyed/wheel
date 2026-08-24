/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext } from 'solid-js';
import type { FloatingRootStore } from '../../floating-ui-solid';
import type { FieldValidation } from '../../internals/field-root-context/FieldRootContext';
import { SelectStore } from '../store';
import type { SelectRoot } from './SelectRoot';

export interface SelectSelectionRef {
  allowSelectedMouseUp: boolean;
  allowUnselectedMouseUp: boolean;
  dragY: number;
}

export interface SelectRootContext {
  store: SelectStore;
  name: () => string | undefined;
  disabled: () => boolean;
  readOnly: () => boolean;
  required: () => boolean;
  multiple: () => boolean;
  highlightItemOnHover: () => boolean;
  setValue: (nextValue: any, eventDetails: SelectRoot.ChangeEventDetails) => void;
  setOpen: (open: boolean, eventDetails: SelectRoot.ChangeEventDetails) => void;
  listRef: { current: Array<HTMLElement | null> };
  labelsRef: { current: Array<string | null> };
  popupRef: { current: HTMLDivElement | null };
  scrollHandlerRef: { current: ((el: HTMLDivElement) => void) | null };
  handleScrollArrowVisibility: () => void;
  scrollArrowsMountedCountRef: { current: number };
  itemProps: HTMLPropsLike;
  valueRef: { current: HTMLSpanElement | null };
  valuesRef: { current: Array<any> };
  typingRef: { current: boolean };
  selectionRef: { current: SelectSelectionRef };
  firstItemTextRef: { current: HTMLElement | null };
  selectedItemTextRef: { current: HTMLElement | null };
  validation: FieldValidation;
  onOpenChangeComplete: ((open: boolean) => void) | undefined;
  alignItemWithTriggerActiveRef: { current: boolean };
  initialValueRef: { current: any };
}

// Deliberately loose (mirrors upstream's `HTMLProps` for `itemProps`) — `listNavigation.item` is a
// plain handler-only object.
type HTMLPropsLike = Record<string, any>;

export const SelectRootContext = createContext<SelectRootContext | undefined>(undefined);
export const SelectFloatingContext = createContext<FloatingRootStore | undefined>(undefined);

export function useSelectRootContext(): SelectRootContext {
  const context = useContext(SelectRootContext);
  if (context === undefined) {
    throw new Error(
      'Base UI: SelectRootContext is missing. Select parts must be placed within <Select.Root>.',
    );
  }
  return context;
}

export function useSelectFloatingContext(): FloatingRootStore {
  const context = useContext(SelectFloatingContext);
  if (context === undefined) {
    throw new Error(
      'Base UI: SelectFloatingContext is missing. Select parts must be placed within <Select.Root>.',
    );
  }
  return context;
}
