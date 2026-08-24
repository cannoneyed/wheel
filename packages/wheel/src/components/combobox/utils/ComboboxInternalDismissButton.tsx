import type { JSX } from 'solid-js';
import { visuallyHiddenInput } from '../../base-utils/visuallyHidden';
import { createButton } from '../../internals/use-button/createButton';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import { renderElement } from '../../internals/renderElement';
import { useComboboxRootContext } from '../root/ComboboxRootContext';

/**
 * Solid port of upstream's `combobox/utils/ComboboxInternalDismissButton.tsx`.
 * @internal
 */
export function ComboboxInternalDismissButton(props: {
  ref?: (el: HTMLSpanElement | null) => void;
}): JSX.Element {
  const store = useComboboxRootContext();

  const { getButtonProps, buttonRef } = createButton({ native: () => false });

  function handleDismiss(event: MouseEvent | KeyboardEvent) {
    store.context.setOpen(
      false,
      createChangeEventDetails(REASONS.closePress, event, event.currentTarget as Element),
    );
  }

  return renderElement('span', {}, {
    ref: [props.ref, buttonRef as unknown as (el: HTMLElement | null) => void],
    props: [
      () => getButtonProps({ onClick: handleDismiss }),
      { 'aria-label': 'Dismiss', tabIndex: undefined, style: visuallyHiddenInput },
    ],
  });
}
