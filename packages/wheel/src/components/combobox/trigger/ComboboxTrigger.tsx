/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { useSignal } from '../../../core/local-state';
import { createEffect, splitProps, type JSX } from 'solid-js';
import { ownerDocument } from '../../base-utils/owner';
import { createTimeout } from '../../base-utils/createTimeout';
import { contains, getTarget, useClick, useTypeahead } from '../../floating-ui-solid';
import type { BaseUIComponentProps, NativeButtonProps } from '../../internals/types';
import {
  useComboboxFloatingContext,
  useComboboxDerivedItemsContext,
  useComboboxRootContext,
} from '../root/ComboboxRootContext';
import { triggerStateAttributesMapping } from '../utils/stateAttributesMapping';
import { useFieldRootContext } from '../../internals/field-root-context/FieldRootContext';
import { useLabelableContext } from '../../internals/labelable-provider/LabelableContext';
import { getPseudoElementBounds } from '../../utils/getPseudoElementBounds';
import type { FieldRoot } from '../../field/root/FieldRoot';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import { createButton } from '../../internals/use-button/createButton';
import type { Side } from '../../utils/useAnchorPositioning';
import { useLabelableId } from '../../internals/labelable-provider/useLabelableId';
import { resolveAriaLabelledBy } from '../../utils/resolveAriaLabelledBy';
import { getComboboxPopupId } from '../root/utils';
import { renderElement } from '../../internals/renderElement';

const BOUNDARY_OFFSET = 2;

/**
 * A button that opens the popup.
 * Renders a `<button>` element.
 *
 * Documentation: [Base UI Combobox](https://base-ui.com/react/components/combobox)
 */
export function ComboboxTrigger(componentProps: ComboboxTrigger.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'id',
    'disabled',
    'nativeButton',
  ]);

  const {
    state: fieldState,
    disabled: fieldDisabled,
    setTouched,
    setFocused,
    validationMode,
    validation,
  } = useFieldRootContext();
  const { labelId: fieldLabelId } = useLabelableContext();
  const store = useComboboxRootContext();
  const { filteredItems } = useComboboxDerivedItemsContext();

  const selectionMode = store.useState('selectionMode');
  const comboboxDisabled = store.useState('disabled');
  const readOnly = store.useState('readOnly');
  const required = store.useState('required');
  const mounted = store.useState('mounted');
  const popupSideValue = store.useState('popupSide');
  const positionerElement = store.useState('positionerElement');
  const listElement = store.useState('listElement');
  const storedPopupId = store.useState('popupId');
  const triggerProps = store.useState('triggerProps');
  const triggerElement = store.useState('triggerElement');
  const inputInsidePopup = store.useState('inputInsidePopup');
  const rootId = store.useState('id');
  const comboboxLabelId = store.useState('labelId');
  const open = store.useState('open');
  const selectedValue = store.useState('selectedValue');
  const activeIndex = store.useState('activeIndex');
  const selectedIndex = store.useState('selectedIndex');
  const hasSelectedValue = store.useState('hasSelectedValue');
  const inputValue = store.useState('inputValue');

  const floatingRootContext = useComboboxFloatingContext();

  const focusTimeout = createTimeout();

  const disabled = () => (fieldDisabled() || comboboxDisabled() || (local.disabled ?? false)) ?? false;
  const nativeButton = () => local.nativeButton ?? true;
  const listEmpty = () => filteredItems().length === 0;
  const popupSide = () => (mounted() && positionerElement() ? popupSideValue() : null);

  useLabelableId({ id: () => (inputInsidePopup() ? local.id : undefined) });
  const id = () => (inputInsidePopup() ? (local.id ?? rootId()) : local.id);
  const ariaLabelledBy = () => resolveAriaLabelledBy(fieldLabelId(), comboboxLabelId());

  const ariaControls = () => {
    if (open() && inputInsidePopup()) {
      return storedPopupId() ?? getComboboxPopupId(rootId());
    }
    if (open()) {
      return listElement()?.id;
    }
    return undefined;
  };

  const [currentPointerType, setCurrentPointerType] = useSignal<PointerEvent['pointerType']>('', 'currentPointerType');

  function trackPointerType(event: PointerEvent) {
    setCurrentPointerType(event.pointerType);
  }

  const domReference = floatingRootContext.useState('domReferenceElement');

  createEffect(() => {
    if (!inputInsidePopup()) {
      return;
    }
    if (triggerElement() && triggerElement() !== domReference()) {
      floatingRootContext.set('domReferenceElement', triggerElement());
    }
  });

  const { reference: triggerTypeaheadProps } = useTypeahead(floatingRootContext, {
    enabled: () => !open() && !readOnly() && !comboboxDisabled() && selectionMode() === 'single',
    listRef: store.context.labelsRef,
    activeIndex,
    selectedIndex,
    onMatch(index) {
      const nextSelectedValue = store.context.valuesRef.current[index];
      if (nextSelectedValue !== undefined) {
        store.context.setSelectedValue(nextSelectedValue, createChangeEventDetails(REASONS.none));
      }
    },
  });

  const { reference: triggerClickProps } = useClick(floatingRootContext, {
    enabled: () => !readOnly() && !comboboxDisabled(),
    event: () => 'mousedown',
  });

  const { buttonRef, getButtonProps } = createButton({ native: nativeButton, disabled });

  const state: ComboboxTriggerState = {
    get disabled() {
      return fieldState.disabled;
    },
    get touched() {
      return fieldState.touched;
    },
    get dirty() {
      return fieldState.dirty;
    },
    get valid() {
      return fieldState.valid;
    },
    get filled() {
      return fieldState.filled;
    },
    get focused() {
      return fieldState.focused;
    },
    get open() {
      return open();
    },
    get popupSide() {
      return popupSide();
    },
    get listEmpty() {
      return listEmpty();
    },
    get placeholder() {
      return selectionMode() === 'none' ? false : !hasSelectedValue();
    },
  };

  const setTriggerElement = (element: HTMLElement | null) => {
    store.set('triggerElement', element);
  };

  return renderElement('button', componentProps, {
    defaultClass: 'wheel-Combobox-Trigger',
    slot: 'combobox-trigger',
    ref: [buttonRef, setTriggerElement],
    state,
    props: [
      triggerProps,
      triggerClickProps,
      triggerTypeaheadProps,
      () => ({
        id: id(),
        tabIndex: inputInsidePopup() ? 0 : -1,
        role: inputInsidePopup() ? 'combobox' : undefined,
        'aria-expanded': open() ? 'true' : 'false',
        'aria-haspopup': inputInsidePopup() ? 'dialog' : 'listbox',
        'aria-controls': ariaControls(),
        'aria-required': inputInsidePopup() ? required() || undefined : undefined,
        'aria-labelledby': ariaLabelledBy(),
        onPointerDown: trackPointerType,
        onPointerEnter: trackPointerType,
        onFocus() {
          setFocused(true);

          if (disabled() || readOnly()) {
            return;
          }

          focusTimeout.start(0, store.context.forceMount);
        },
        onBlur(event: FocusEvent) {
          if (contains(positionerElement(), event.relatedTarget as Element | null)) {
            return;
          }

          setTouched(true);
          setFocused(false);

          if (validationMode() === 'onBlur') {
            const valueToValidate = selectionMode() === 'none' ? inputValue() : selectedValue();
            validation.commit(valueToValidate);
          }
        },
        onMouseDown(event: MouseEvent) {
          if (disabled() || readOnly()) {
            return;
          }

          if (!inputInsidePopup()) {
            floatingRootContext.set('domReferenceElement', event.currentTarget as Element);
          }

          store.context.forceMount();

          if (currentPointerType() !== 'touch') {
            store.context.inputRef.current?.focus();

            if (!inputInsidePopup()) {
              event.preventDefault();
            }
          }

          if (open()) {
            return;
          }

          const doc = ownerDocument(event.currentTarget as Element | null);

          function handleMouseUp(mouseEvent: MouseEvent) {
            const trigger = triggerElement();
            if (!trigger) {
              return;
            }

            const mouseUpTarget = getTarget(mouseEvent) as Element | null;
            const positioner = store.state.positionerElement;
            const list = store.state.listElement;

            if (
              contains(trigger, mouseUpTarget) ||
              contains(positioner, mouseUpTarget) ||
              contains(list, mouseUpTarget) ||
              mouseUpTarget === trigger
            ) {
              return;
            }

            const bounds = getPseudoElementBounds(trigger as HTMLElement);

            const withinHorizontal =
              mouseEvent.clientX >= bounds.left - BOUNDARY_OFFSET &&
              mouseEvent.clientX <= bounds.right + BOUNDARY_OFFSET;
            const withinVertical =
              mouseEvent.clientY >= bounds.top - BOUNDARY_OFFSET &&
              mouseEvent.clientY <= bounds.bottom + BOUNDARY_OFFSET;

            if (withinHorizontal && withinVertical) {
              return;
            }

            store.context.setOpen(false, createChangeEventDetails(REASONS.cancelOpen, mouseEvent));
          }

          if (inputInsidePopup()) {
            doc.addEventListener('mouseup', handleMouseUp, { once: true });
          }
        },
        onKeyDown(event: KeyboardEvent) {
          if (disabled() || readOnly()) {
            return;
          }

          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            event.stopPropagation();
            store.context.setOpen(true, createChangeEventDetails(REASONS.listNavigation, event));
            store.context.inputRef.current?.focus();
          }
        },
      }),
      () => (validation ? validation.getValidationProps(disabled(), elementProps) : elementProps),
      getButtonProps,
    ],
    stateAttributesMapping: triggerStateAttributesMapping,
  });
}

export interface ComboboxTriggerState extends FieldRoot.State {
  /**
   * Whether the popup is open.
   */
  open: boolean;
  /**
   * Indicates which side the corresponding popup is positioned relative to its anchor.
   */
  popupSide: Side | null;
  /**
   * Present when the corresponding items list is empty.
   */
  listEmpty: boolean;
  /**
   * Whether the combobox doesn't have a value.
   */
  placeholder: boolean;
}

export interface ComboboxTriggerProps
  extends NativeButtonProps,
    BaseUIComponentProps<'button', ComboboxTriggerState> {
  /**
   * Whether the component should ignore user interaction.
   * @default false
   */
  disabled?: boolean | undefined;
}

export namespace ComboboxTrigger {
  export type State = ComboboxTriggerState;
  export type Props = ComboboxTriggerProps;
}
