import { createEffect, onCleanup, type Accessor } from 'solid-js';
import { createBaseUiId } from './createBaseUiId';

/**
 * Returns the id used to label a parent component and registers it with the
 * parent (via `setLabelId`) for the lifetime of the component.
 * Solid port of upstream's `useRegisteredLabelId`.
 */
export function createRegisteredLabelId(
  idProp: Accessor<string | undefined>,
  setLabelId: (id: string | undefined) => void,
): Accessor<string | undefined> {
  const id = createBaseUiId(idProp);

  createEffect(() => {
    setLabelId(id());
    onCleanup(() => setLabelId(undefined));
  });

  return id;
}
