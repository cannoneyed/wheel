/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import { createButton } from '../../internals/use-button/createButton';
import { createTransitionStatus, type TransitionStatus } from '../../internals/createTransitionStatus';
import { transitionStatusMapping } from '../../internals/stateAttributesMapping';
import type { StateAttributesMapping } from '../../internals/getStateAttributesProps';
import { createOpenChangeComplete } from '../../internals/createOpenChangeComplete';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import { triggerOpenStateMapping } from '../../utils/popupStateMapping';
import { renderElement } from '../../internals/renderElement';
import type { BaseUIComponentProps, NativeButtonProps } from '../../internals/types';
import { useComboboxRootContext } from '../root/ComboboxRootContext';

const stateAttributesMapping: StateAttributesMapping<ComboboxClearState> = {
  ...transitionStatusMapping,
  ...triggerOpenStateMapping,
};

/**
 * Clears the value when clicked.
 * Renders a `<button>` element.
 *
 * Documentation: [Base UI Combobox](https://base-ui.com/react/components/combobox)
 */
export function ComboboxClear(componentProps: ComboboxClear.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'disabled',
    'nativeButton',
    'keepMounted',
  ]);

  const store = useComboboxRootContext();

  const selectionMode = store.useState('selectionMode');
  const comboboxDisabled = store.useState('disabled');
  const readOnly = store.useState('readOnly');
  const open = store.useState('open');
  const selectedValue = store.useState('selectedValue');
  const hasSelectionChips = store.useState('hasSelectionChips');
  const inputValue = store.useState('inputValue');

  const visible = () => {
    if (selectionMode() === 'none') {
      return inputValue() !== '';
    }
    if (selectionMode() === 'single') {
      return selectedValue() != null;
    }
    return hasSelectionChips();
  };

  const disabled = () => (comboboxDisabled() || local.disabled) ?? false;
  const nativeButton = () => local.nativeButton ?? true;
  const keepMounted = () => local.keepMounted ?? false;

  // Read exactly once (component bodies run once in Solid).
  const childrenValue = local.children;

  const { getButtonProps, buttonRef } = createButton({ native: nativeButton, disabled });

  const { mounted, transitionStatus, setMounted } = createTransitionStatus(visible);

  const state: ComboboxClear.State = {
    get disabled() {
      return disabled();
    },
    get visible() {
      return visible();
    },
    get open() {
      return open();
    },
    get transitionStatus() {
      return transitionStatus();
    },
  };

  createOpenChangeComplete({
    open: visible,
    getElement: () => store.context.clearRef.current,
    onComplete() {
      if (!visible()) {
        setMounted(false);
      }
    },
  });

  function handleClick() {
    if (disabled() || readOnly()) {
      return;
    }

    const keyboardActive = store.context.keyboardActiveRef.current;

    store.context.setInputValue('', createChangeEventDetails(REASONS.clearPress));

    if (selectionMode() !== 'none') {
      store.context.setSelectedValue(
        Array.isArray(selectedValue()) ? [] : null,
        createChangeEventDetails(REASONS.clearPress),
      );
      store.context.setIndices({
        activeIndex: null,
        selectedIndex: null,
        type: keyboardActive ? 'keyboard' : 'pointer',
      });
    } else {
      store.context.setIndices({
        activeIndex: null,
        type: keyboardActive ? 'keyboard' : 'pointer',
      });
    }

    store.context.inputRef.current?.focus();
  }

  const element = renderElement('button', componentProps, {
    defaultClass: 'wheel-Combobox-Clear',
    slot: 'combobox-clear',
    state,
    ref: [buttonRef, (el: HTMLElement | null) => {
      store.context.clearRef.current = el as HTMLButtonElement | null;
    }],
    props: [
      {
        tabIndex: -1,
        // Avoid stealing focus from the input.
        onMouseDown(event: MouseEvent) {
          event.preventDefault();
        },
        onClick: handleClick,
      },
      elementProps,
      getButtonProps,
    ],
    stateAttributesMapping,
    children: () => (childrenValue ?? 'x') as JSX.Element,
    enabled: () => keepMounted() || mounted(),
  });

  return element;
}

export interface ComboboxClearState {
  /**
   * Whether the popup is open.
   */
  open: boolean;
  /**
   * Whether the component should ignore user interaction.
   */
  disabled: boolean;
  /**
   * Whether the clear button should be visible.
   */
  visible: boolean;
  /**
   * The transition status of the component.
   */
  transitionStatus: TransitionStatus;
}

export interface ComboboxClearProps
  extends NativeButtonProps,
    BaseUIComponentProps<'button', ComboboxClearState> {
  /**
   * Whether the component should ignore user interaction.
   * @default false
   */
  disabled?: boolean | undefined;
  /**
   * Whether the component should remain mounted in the DOM when not visible.
   * @default false
   */
  keepMounted?: boolean | undefined;
}

export namespace ComboboxClear {
  export type State = ComboboxClearState;
  export type Props = ComboboxClearProps;
}
