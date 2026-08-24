import { isElement } from '@floating-ui/utils/dom';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import { getTarget, isInteractiveElement } from '../../floating-ui-solid';
import type { ComboboxStore } from '../store';

/**
 * Solid port of upstream's `combobox/utils/handleInputPress.ts`.
 */
export function handleInputPress(
  event: MouseEvent & { baseUIHandlerPrevented?: boolean | undefined },
  store: ComboboxStore,
  disabled: boolean,
  readOnly: boolean,
  shouldIgnoreTarget?: ((target: Element | null) => boolean) | undefined,
) {
  if (event.baseUIHandlerPrevented || readOnly) {
    return;
  }

  const target = getTarget(event);
  const targetElement = isElement(target) ? target : null;
  if (
    targetElement !== event.currentTarget &&
    (shouldIgnoreTarget?.(targetElement) || isInteractiveElement(targetElement))
  ) {
    return;
  }

  event.preventDefault();

  if (disabled) {
    return;
  }

  store.context.inputRef.current?.focus();

  if (store.state.openOnInputClick) {
    store.context.setOpen(true, createChangeEventDetails(REASONS.inputPress, event));
  }
}
