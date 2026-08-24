/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import type { Accessor } from 'solid-js';
import { ownerDocument } from '../../base-utils/owner';
import { createRegisteredLabelId } from '../createRegisteredLabelId';
import type { HTMLProps } from '../types';
import { useLabelableContext } from './LabelableContext';

export interface UseLabelParameters {
  id?: Accessor<string | undefined> | undefined;
  /**
   * Control id used when no labelable context control id exists.
   */
  fallbackControlId?: Accessor<string | null | undefined> | undefined;
  /**
   * Whether the rendered element is a native `<label>`.
   * @default false
   */
  native?: Accessor<boolean> | undefined;
  /**
   * Additional callback to sync the current label id with local component state/store.
   */
  setLabelId?: ((nextLabelId: string | undefined) => void) | undefined;
  /**
   * Custom focus handler for non-native labels.
   * If omitted, focus behavior targets the resolved control id.
   */
  focusControl?:
    | ((event: MouseEvent, controlId: string | null | undefined) => void)
    | undefined;
}

/**
 * Returns the props for a labelable element (native `<label>` or a non-native
 * label-like element), syncing its id with the surrounding labelable provider.
 * Solid port of upstream's `useLabel`.
 */
export function useLabel(params: UseLabelParameters = {}): Accessor<HTMLProps> {
  const { fallbackControlId, setLabelId: setLabelIdProp, focusControl: focusControlProp } = params;
  const native = () => params.native?.() ?? false;

  const { controlId: contextControlId, setLabelId: setContextLabelId } = useLabelableContext();

  const syncLabelId = (nextLabelId: string | undefined) => {
    setContextLabelId(nextLabelId);
    setLabelIdProp?.(nextLabelId);
  };

  const id = createRegisteredLabelId(params.id ?? (() => undefined), syncLabelId);

  const resolvedControlId = () => contextControlId() ?? fallbackControlId?.();

  function focusControl(event: MouseEvent) {
    const controlId = resolvedControlId();

    if (focusControlProp) {
      focusControlProp(event, controlId);
      return;
    }

    if (!controlId) {
      return;
    }

    const controlElement = ownerDocument(event.currentTarget as Element).getElementById(controlId);
    if (controlElement instanceof HTMLElement) {
      focusElementWithVisible(controlElement);
    }
  }

  function handleInteraction(event: MouseEvent) {
    const target = event.target as HTMLElement | null;
    if (target?.closest('button,input,select,textarea')) {
      return;
    }

    // Prevent text selection when double clicking label.
    if (!event.defaultPrevented && event.detail > 1) {
      event.preventDefault();
    }

    if (native()) {
      return;
    }

    focusControl(event);
  }

  return () =>
    native()
      ? {
          id: id(),
          htmlFor: resolvedControlId() ?? undefined,
          onMouseDown: handleInteraction,
        }
      : {
          id: id(),
          onClick: handleInteraction,
          onPointerDown(event: PointerEvent) {
            event.preventDefault();
          },
        };
}

export function focusElementWithVisible(element: HTMLElement) {
  element.focus({
    // Available from Chrome 144+ (January 2026).
    // Safari and Firefox already support it.
    focusVisible: true,
  } as FocusOptions);
}
