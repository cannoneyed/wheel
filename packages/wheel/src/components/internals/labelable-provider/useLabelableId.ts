/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createEffect, onCleanup, type Accessor } from 'solid-js';
import { createBaseUiId } from '../createBaseUiId';
import { useLabelableContext } from './LabelableContext';

export interface UseLabelableIdParameters {
  id?: Accessor<string | undefined> | undefined;
  /**
   * Whether the control supports implicit label association (being wrapped by
   * its `<label>`).
   * @default false
   */
  implicit?: boolean | undefined;
  /**
   * A ref to an element that can be implicitly labelled.
   */
  controlRef?: { current: HTMLElement | null } | undefined;
}

/**
 * Returns the id used to associate a form control with its label, and registers the control with
 * the surrounding labelable provider (for implicit label association via `htmlFor`/`aria-labelledby`).
 * Solid port of upstream's `useLabelableId`.
 */
export function useLabelableId(params: UseLabelableIdParameters = {}): Accessor<string | undefined> {
  const { id: idProp, implicit = false, controlRef } = params;

  const { controlId, registerControlId } = useLabelableContext();
  const defaultId = createBaseUiId(idProp);

  const controlSource = Symbol('labelable-control');
  let hasRegistered = false;
  let hadExplicitId = idProp?.() != null;

  const unregisterControlId = () => {
    if (!hasRegistered) {
      return;
    }
    hasRegistered = false;
    registerControlId(controlSource, undefined);
  };

  createEffect(() => {
    const id = idProp?.();
    const controlIdForEffect = implicit ? controlId() : undefined;
    const def = defaultId();

    let nextId: string | null | undefined;

    if (implicit) {
      const elem = controlRef?.current;

      if (elem instanceof Element && elem.closest('label') != null) {
        nextId = id ?? null;
      } else {
        nextId = controlIdForEffect ?? def;
      }
    } else if (id != null) {
      hadExplicitId = true;
      nextId = id;
    } else if (hadExplicitId) {
      nextId = def;
    } else {
      unregisterControlId();
      return;
    }

    if (nextId === undefined) {
      unregisterControlId();
      return;
    }

    hasRegistered = true;
    registerControlId(controlSource, nextId);
  });

  onCleanup(unregisterControlId);

  return () => controlId() ?? defaultId();
}
