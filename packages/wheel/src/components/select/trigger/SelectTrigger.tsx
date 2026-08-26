/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createEffect, splitProps, type JSX } from 'solid-js';
import { ownerDocument } from '../../base-utils/owner';
import { createTimeout } from '../../base-utils/createTimeout';
import { useSelectRootContext } from '../root/SelectRootContext';
import type { BaseUIComponentProps, NativeButtonProps } from '../../internals/types';
import { useFieldRootContext } from '../../internals/field-root-context/FieldRootContext';
import { useLabelableContext } from '../../internals/labelable-provider/LabelableContext';
import { pressableTriggerOpenStateMapping } from '../../utils/popupStateMapping';
import { fieldValidityMapping } from '../../internals/field-constants/constants';
import { renderElement } from '../../internals/renderElement';
import type { StateAttributesMapping } from '../../internals/getStateAttributesProps';
import { getPseudoElementBounds } from '../../utils/getPseudoElementBounds';
import { contains, getFloatingFocusElement } from '../../floating-ui-solid';
import { mergeProps } from '../../merge-props/mergeProps';
import { createButton } from '../../internals/use-button/createButton';
import type { FieldRootState } from '../../field/root/FieldRoot';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import { useLabelableId } from '../../internals/labelable-provider/useLabelableId';
import { resolveAriaLabelledBy } from '../../utils/resolveAriaLabelledBy';
import type { Side } from '../../utils/useAnchorPositioning';

const BOUNDARY_OFFSET = 2;
const SELECTED_DELAY = 400;

const stateAttributesMapping: StateAttributesMapping<SelectTriggerState> = {
  ...pressableTriggerOpenStateMapping,
  ...fieldValidityMapping,
  popupSide: (side: Side | 'none' | null) => (side && side !== 'none' ? { 'data-popup-side': side } : null),
  value: () => null,
};

/**
 * A button that opens the select popup.
 * Renders a `<button>` element.
 *
 * Documentation: [Base UI Select](https://base-ui.com/react/components/select)
 */
export function SelectTrigger(componentProps: SelectTrigger.Props): JSX.Element {
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
    setTouched,
    setFocused,
    validationMode,
    state: fieldState,
    disabled: fieldDisabled,
  } = useFieldRootContext();
  const { labelId: fieldLabelId } = useLabelableContext();
  const {
    store,
    setOpen,
    setValue,
    selectionRef,
    validation,
    readOnly,
    required,
    multiple,
    valuesRef,
    alignItemWithTriggerActiveRef,
    disabled: selectDisabled,
    size,
    status,
    variant,
  } = useSelectRootContext();

  const disabled = () => (fieldDisabled() || selectDisabled() || (local.disabled ?? false)) ?? false;
  const nativeButton = () => local.nativeButton ?? true;

  const open = store.useState('open');
  const mounted = store.useState('mounted');
  const value = store.useState('value');
  const triggerProps = store.useState('triggerProps');
  const positionerElement = store.useState('positionerElement');
  const listElement = store.useState('listElement');
  const popupSideValue = store.useState('popupSide');
  const rootId = store.useState('id');
  const selectLabelId = store.useState('labelId');
  const hasSelectedValue = store.useState('hasSelectedValue');
  const popupSide = () => (mounted() && positionerElement() ? popupSideValue() : null);

  const id = () => local.id ?? rootId();
  const ariaLabelledBy = () => resolveAriaLabelledBy(fieldLabelId(), selectLabelId());

  useLabelableId({ id });

  const triggerRef: { current: HTMLElement | null } = { current: null };

  const { getButtonProps, buttonRef } = createButton({
    disabled,
    native: nativeButton,
  });

  const timeoutFocus = createTimeout();
  const timeoutMouseDown = createTimeout();
  const selectedDelayTimeout = createTimeout();

  createEffect(() => {
    if (open()) {
      // A mousedown on the trigger can open the popup under the cursor. Keep mouseup selection
      // disabled briefly so releasing over either the selected item or a neighboring item doesn't
      // commit an accidental selection.
      selectedDelayTimeout.start(SELECTED_DELAY, () => {
        selectionRef.current.allowUnselectedMouseUp = true;
        selectionRef.current.allowSelectedMouseUp = true;
      });
      return;
    }

    selectionRef.current = {
      allowSelectedMouseUp: false,
      allowUnselectedMouseUp: false,
      dragY: 0,
    };

    timeoutMouseDown.clear();
  });

  const mergedProps = () =>
    mergeProps(
      triggerProps(),
      {
        id: id(),
        role: 'combobox',
        'aria-expanded': open() ? 'true' : 'false',
        'aria-haspopup': 'listbox',
        'aria-controls': open()
          ? (listElement()?.id ?? getFloatingFocusElement(positionerElement())?.id)
          : undefined,
        'aria-labelledby': ariaLabelledBy(),
        'aria-readonly': readOnly() || undefined,
        'aria-required': required() || undefined,
        tabIndex: disabled() ? -1 : 0,
        onFocus(event: FocusEvent) {
          setFocused(true);

          // The popup element shouldn't obscure the focused trigger.
          if (open() && alignItemWithTriggerActiveRef.current) {
            setOpen(false, createChangeEventDetails(REASONS.none, event));
          }

          // Saves a re-render on initial click: `forceMount === true` mounts the items before
          // `open === true`.
          timeoutFocus.start(0, () => {
            store.set('forceMount', true);
          });
        },
        onBlur(event: FocusEvent) {
          // If focus is moving into the popup, don't count it as a blur.
          if (contains(positionerElement(), event.relatedTarget as Element | null)) {
            return;
          }

          setTouched(true);
          setFocused(false);

          if (validationMode() === 'onBlur') {
            validation.commit(value());
          }
        },
        onMouseDown(event: MouseEvent) {
          if (open()) {
            return;
          }

          const doc = ownerDocument(event.currentTarget as Element | null);

          function handleMouseUp(mouseEvent: MouseEvent) {
            if (!triggerRef.current) {
              return;
            }

            const mouseUpTarget = mouseEvent.target as Element | null;

            // Don't treat the release as an outside press when it lands on the trigger or inside
            // the popup positioner (or their children).
            if (
              contains(triggerRef.current, mouseUpTarget) ||
              contains(positionerElement(), mouseUpTarget)
            ) {
              return;
            }

            const bounds = getPseudoElementBounds(triggerRef.current as HTMLElement);

            if (
              mouseEvent.clientX >= bounds.left - BOUNDARY_OFFSET &&
              mouseEvent.clientX <= bounds.right + BOUNDARY_OFFSET &&
              mouseEvent.clientY >= bounds.top - BOUNDARY_OFFSET &&
              mouseEvent.clientY <= bounds.bottom + BOUNDARY_OFFSET
            ) {
              return;
            }

            setOpen(false, createChangeEventDetails(REASONS.cancelOpen, mouseEvent));
          }

          // Firefox can fire this upon mousedown
          timeoutMouseDown.start(0, () => {
            doc.addEventListener('mouseup', handleMouseUp, { once: true });
          });
        },
      },
      elementProps,
      getButtonProps,
    );

  const state: SelectTrigger.State = {
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
    get readOnly() {
      return readOnly();
    },
    get popupSide() {
      return popupSide();
    },
    get value() {
      return value();
    },
    get placeholder() {
      return !hasSelectedValue();
    },
    get size() {
      return size();
    },
    get status() {
      return status();
    },
    get variant() {
      return variant();
    },
  };

  return renderElement('button', componentProps, {
    defaultClass: 'wheel-Select-Trigger',
    slot: 'select-trigger',
    state,
    ref: [
      (el: HTMLElement | null) => {
        triggerRef.current = el;
        store.set('triggerElement', el);
      },
      buttonRef,
    ],
    props: [
      // This zero-arg thunk is `renderElement`'s reactive-props convention (see CONVENTIONS.md);
      // the lint rule doesn't special-case that custom API and flags the call itself.
      () => validation.getValidationProps(disabled(), mergedProps()),
      () => ({
        'data-size': size(),
        'data-status': status(),
        'data-variant': variant(),
        role: 'combobox',
        // Commit the highlighted item on Enter while the popup is open and
        // focus is still on the trigger. The focus hop into the highlighted
        // item rides an rAF-queued `enqueueFocus` that can lose a race with
        // fast typing (ArrowDown then Enter within a frame or after a
        // cancelled frame), in which case the keydown lands here and would
        // otherwise be a no-op — native <select> commits regardless.
        // Single-select only: in multiple mode Enter toggles without closing
        // and is handled by the focused item itself.
        onKeyDown: (event: KeyboardEvent) => {
          if (event.key !== 'Enter' || multiple() || readOnly() || disabled()) {
            return;
          }
          if (!store.state.open) {
            return;
          }
          const index = store.state.activeIndex;
          if (index == null) {
            return;
          }
          const nextValue = valuesRef.current[index];
          if (nextValue === undefined) {
            return;
          }
          event.preventDefault();
          setValue(nextValue, createChangeEventDetails(REASONS.itemPress, event));
          setOpen(false, createChangeEventDetails(REASONS.itemPress, event));
        },
      }),
    ],
    stateAttributesMapping,
  });
}

export interface SelectTriggerState extends FieldRootState {
  /**
   * Whether the select popup is currently open.
   */
  open: boolean;
  /**
   * Whether the select popup is readonly.
   */
  readOnly: boolean;
  /**
   * Indicates which side the corresponding popup is positioned relative to its anchor.
   */
  popupSide: Side | 'none' | null;
  /**
   * The value of the currently selected item.
   */
  value: any;
  /**
   * Whether the select doesn't have a value.
   */
  placeholder: boolean;
  /** Current control size. */
  size: import('../types').SelectSize;
  /** Current validation tone. */
  status: import('../types').SelectStatus | undefined;
  /** Current surface treatment. */
  variant: import('../types').SelectVariant;
}

export interface SelectTriggerProps
  extends NativeButtonProps,
    BaseUIComponentProps<'button', SelectTriggerState> {
  children?: JSX.Element;
  /**
   * Whether the component should ignore user interaction.
   */
  disabled?: boolean | undefined;
}

export namespace SelectTrigger {
  export type State = SelectTriggerState;
  export type Props = SelectTriggerProps;
}
