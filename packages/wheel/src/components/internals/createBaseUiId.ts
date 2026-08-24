import { createMemo, createUniqueId, type Accessor } from 'solid-js';

/**
 * Returns the provided id if it exists, otherwise a stable generated one.
 * Solid port of upstream's `useBaseUiId`.
 */
export function createBaseUiId(
  idProp?: Accessor<string | undefined>,
): Accessor<string | undefined> {
  const generated = `base-ui-${createUniqueId()}`;
  return createMemo(() => idProp?.() ?? generated);
}
