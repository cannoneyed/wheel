/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import type { BaseUIComponentProps } from '../../internals/types';
import { useFieldRootContext } from '../../internals/field-root-context/FieldRootContext';
import { useComboboxRootContext } from '../root/ComboboxRootContext';
import { useFilteredItems } from '../root/utils/useFilteredItems';
import { triggerStateAttributesMapping } from '../utils/stateAttributesMapping';
import { handleInputPress } from '../utils/handleInputPress';
import { contains } from '../../floating-ui-solid';
import { renderElement } from '../../internals/renderElement';
import type { Side } from '../../utils/useAnchorPositioning';
import type { FieldRoot } from '../../field/root/FieldRoot';

/**
 * A wrapper for the input and its associated controls.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Combobox](https://base-ui.com/react/components/combobox)
 */
export function ComboboxInputGroup(componentProps: ComboboxInputGroup.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, ['class', 'style', 'as', 'asChild', 'children']);

  const { state: fieldState } = useFieldRootContext();
  const store = useComboboxRootContext();
  const filteredItems = useFilteredItems();

  const open = store.useState('open');
  const mounted = store.useState('mounted');
  const popupSideValue = store.useState('popupSide');
  const positionerElement = store.useState('positionerElement');
  const comboboxDisabled = store.useState('disabled');
  const readOnly = store.useState('readOnly');
  const hasSelectedValue = store.useState('hasSelectedValue');
  const selectionMode = store.useState('selectionMode');

  const popupSide = () => (mounted() && positionerElement() ? popupSideValue() : null);
  const listEmpty = () => filteredItems().length === 0;
  // `selectionMode() === 'none'` is only reachable via `Autocomplete.Root` (see
  // `ComboboxRoot.tsx`'s class doc comment) — there's no persisted "selected value" concept there,
  // so `placeholder` never applies. Mirrors `ComboboxTrigger.tsx`'s identical guard.
  const placeholder = () => (selectionMode() === 'none' ? false : !hasSelectedValue());

  const state: ComboboxInputGroup.State = {
    get disabled() {
      return comboboxDisabled();
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
    get listEmpty() {
      return listEmpty();
    },
    get placeholder() {
      return placeholder();
    },
  };

  return renderElement('div', componentProps, {
    defaultClass: 'wheel-Combobox-InputGroup',
    slot: 'combobox-input-group',
    ref: (el: HTMLElement | null) => {
      store.set('inputGroupElement', el as HTMLDivElement | null);
    },
    state,
    props: [
      {
        role: 'group',
        onMouseDown(event: MouseEvent) {
          handleInputPress(event, store, comboboxDisabled(), readOnly(), (target) =>
            contains(store.context.chipsContainerRef.current, target),
          );
        },
      },
      elementProps,
    ],
    stateAttributesMapping: triggerStateAttributesMapping,
  });
}

export interface ComboboxInputGroupState extends FieldRoot.State {
  /**
   * Whether the corresponding popup is open.
   */
  open: boolean;
  /**
   * Whether the component should ignore user edits.
   */
  readOnly: boolean;
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

export interface ComboboxInputGroupProps
  extends BaseUIComponentProps<'div', ComboboxInputGroupState> {}

export namespace ComboboxInputGroup {
  export type State = ComboboxInputGroupState;
  export type Props = ComboboxInputGroupProps;
}
