/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createEffect, createSignal, onCleanup, type Accessor } from 'solid-js';
import { useCompositeListContext } from './CompositeListContext';

export interface CreateCompositeListItemParameters<Metadata> {
  index?: Accessor<number | undefined> | undefined;
  label?: Accessor<string | null | undefined> | undefined;
  metadata?: Accessor<Metadata | undefined> | undefined;
  textRef?: Accessor<HTMLElement | null | undefined> | undefined;
  /**
   * Enables guessing the indexes. This avoids a re-render after mount, which
   * is useful for large lists. This should be used for lists that are likely
   * flat and vertical, other cases might trigger a re-render anyway.
   */
  indexGuessBehavior?: IndexGuessBehavior | undefined;
}

interface CreateCompositeListItemReturnValue {
  ref: (node: HTMLElement | null) => void;
  index: Accessor<number>;
}

export enum IndexGuessBehavior {
  None,
  GuessFromOrder,
}

/**
 * Used to register a list item and its index (DOM position) in the
 * `CompositeList`. Solid port of upstream's `useCompositeListItem`.
 */
export function createCompositeListItem<Metadata>(
  params: CreateCompositeListItemParameters<Metadata> = {},
): CreateCompositeListItemReturnValue {
  const { register, unregister, subscribeMapChange, elements, labels, nextIndex } =
    useCompositeListContext<Metadata>();

  const externalIndex = () => params.index?.();

  const initialIndex = (): number => {
    const external = externalIndex();
    if (external != null) {
      return external;
    }
    if (params.indexGuessBehavior === IndexGuessBehavior.GuessFromOrder) {
      const newIndex = nextIndex.current;
      nextIndex.current += 1;
      return newIndex;
    }
    return -1;
  };

  const [index, setIndex] = createSignal<number>(initialIndex());

  let componentRef: Element | null = null;

  const syncElement = () => {
    const i = index();
    if (i !== -1 && componentRef !== null) {
      elements[i] = componentRef as HTMLElement;

      if (labels) {
        const labelValue = params.label?.();
        const isLabelDefined = labelValue !== undefined;
        labels[i] = isLabelDefined
          ? (labelValue ?? null)
          : (params.textRef?.()?.textContent ?? componentRef.textContent);
      }
    }
  };

  const ref = (node: HTMLElement | null) => {
    componentRef = node;
    syncElement();
  };

  // Re-sync the element/label slot whenever the index changes (e.g. after a
  // DOM reorder is detected by `CompositeList`).
  createEffect(() => {
    syncElement();
  });

  createEffect(() => {
    if (externalIndex() != null) {
      return;
    }

    const node = componentRef;
    if (node) {
      register(node, params.metadata?.());
      onCleanup(() => {
        unregister(node);
      });
    }
  });

  createEffect(() => {
    if (externalIndex() != null) {
      return;
    }

    const unsubscribe = subscribeMapChange((map) => {
      const i = componentRef ? map.get(componentRef)?.index : null;

      if (i != null) {
        setIndex(i);
      }
    });

    onCleanup(unsubscribe);
  });

  return { ref, index };
}
