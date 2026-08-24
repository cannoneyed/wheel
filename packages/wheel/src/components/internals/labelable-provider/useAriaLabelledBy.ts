import { createEffect, createSignal, type Accessor } from 'solid-js';
import { createBaseUiId } from '../createBaseUiId';

type LabelSource = HTMLElement & { labels?: NodeListOf<HTMLLabelElement> | null | undefined };

/**
 * Computes the `aria-labelledby` value for a form control from the explicit prop and the label id
 * provided by the labelable provider, falling back (for non-native controls without an explicit
 * `Field.Label`) to discovering a wrapping/sibling native `<label>` in the DOM.
 * Solid port of upstream's `useAriaLabelledBy`.
 *
 * @param ariaLabelledByProp - the consumer's explicit `aria-labelledby` prop.
 * @param labelId - the id provided by the labelable provider (e.g. from `Field.Label`).
 * @param labelSourceRef - a ref to the element whose DOM position is used to discover a fallback
 *   `<label>` (e.g. the hidden native input backing a custom control).
 * @param enableFallback - whether to look for a fallback `<label>` at all (upstream disables this
 *   for native buttons, which handle native label association themselves). Defaults to enabled.
 * @param labelSourceId - id used to derive a stable generated id for a label discovered without one.
 */
export function useAriaLabelledBy(
  ariaLabelledByProp: Accessor<string | undefined>,
  labelId: Accessor<string | undefined>,
  labelSourceRef?: { current: HTMLElement | null } | undefined,
  enableFallback: Accessor<boolean> = () => true,
  labelSourceId?: Accessor<string | undefined> | undefined,
): Accessor<string | undefined> {
  const [fallbackAriaLabelledBy, setFallbackAriaLabelledBy] = createSignal<string | undefined>(
    undefined,
  );

  const generatedLabelId = createBaseUiId(() => {
    const sourceId = labelSourceId?.();
    return sourceId ? `${sourceId}-label` : undefined;
  });

  // Fallback for <span> controls labelled by wrapping/sibling native <label>. Reruns whenever any
  // input changes so DOM association changes (e.g. label mount/unmount) are reflected.
  createEffect(() => {
    const explicit = ariaLabelledByProp();
    const lid = labelId();
    const fallbackEnabled = enableFallback();
    const genId = generatedLabelId();

    const nextAriaLabelledBy =
      explicit || lid || !fallbackEnabled
        ? undefined
        : getAriaLabelledBy(labelSourceRef?.current, genId);

    setFallbackAriaLabelledBy((prev) => (prev !== nextAriaLabelledBy ? nextAriaLabelledBy : prev));
  });

  return () => ariaLabelledByProp() ?? labelId() ?? fallbackAriaLabelledBy();
}

function getAriaLabelledBy(labelSource?: LabelSource | null, generatedLabelId?: string) {
  const label = findAssociatedLabel(labelSource);
  if (!label) {
    return undefined;
  }

  if (!label.id && generatedLabelId) {
    label.id = generatedLabelId;
  }

  return label.id || undefined;
}

function findAssociatedLabel(labelSource?: LabelSource | null) {
  if (!labelSource) {
    return undefined;
  }

  // Fast path before the expensive `.labels` read.
  const parent = labelSource.parentElement;
  if (parent && parent.tagName === 'LABEL') {
    return parent as HTMLLabelElement;
  }

  const controlId = labelSource.id;
  if (controlId) {
    const nextSibling = labelSource.nextElementSibling as HTMLLabelElement | null;
    if (nextSibling && nextSibling.htmlFor === controlId) {
      return nextSibling;
    }
  }

  const labels = labelSource.labels;
  return labels && labels[0];
}
