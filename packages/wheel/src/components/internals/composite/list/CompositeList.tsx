/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { useSignal } from '../../../../core/local-state';
import { createEffect, createMemo, onCleanup, type JSX } from 'solid-js';
import { CompositeListContext } from './CompositeListContext';

export type CompositeMetadata<CustomMetadata> = {
  index?: number | null | undefined;
} & CustomMetadata;

export interface CompositeListProps<Metadata> {
  children?: JSX.Element;
  /**
   * The (mutable) list of HTML elements, ordered by index. Owned by the
   * caller (usually `createCompositeRoot`) and mutated in place — mirrors
   * upstream's `elementsRef.current`.
   */
  elements: Array<HTMLElement | null>;
  /**
   * The (mutable) list of element labels, ordered by index.
   */
  labels?: Array<string | null> | undefined;
  onMapChange?:
    | ((newMap: Map<Element, CompositeMetadata<Metadata> | null>) => void)
    | undefined;
}

/**
 * Provides context for a list of items in a composite component.
 * Solid port of upstream's `CompositeList`.
 * @internal
 */
export function CompositeList<Metadata>(props: CompositeListProps<Metadata>): JSX.Element {
  // We use a stable `map` to avoid O(n^2) re-allocation costs for large lists.
  // `mapTick` is our re-render trigger mechanism (mirrors upstream's state-based
  // re-render trigger, adapted to a Solid signal).
  const map = new Map<Element, CompositeMetadata<Metadata> | null>();
  const nextIndexRef = { current: 0 };

  let lastTick = 0;
  const [mapTick, setMapTick] = useSignal(0, 'mapTick');

  const register = (node: Element, metadata: Metadata | undefined) => {
    map.set(node, (metadata ?? null) as CompositeMetadata<Metadata> | null);
    lastTick += 1;
    setMapTick(lastTick);
  };

  const unregister = (node: Element) => {
    map.delete(node);
    lastTick += 1;
    setMapTick(lastTick);
  };

  const sortedMap = createMemo(() => {
    // `mapTick` is the tracked trigger; `map` itself is a stable mutable object.
    mapTick();

    const newMap = new Map<Element, CompositeMetadata<Metadata>>();
    // Filter out disconnected elements before sorting to avoid inconsistent
    // compareDocumentPosition results when elements are detached from the DOM.
    const sortedNodes = Array.from(map.keys())
      .filter((node) => node.isConnected)
      .sort(sortByDocumentPosition);

    sortedNodes.forEach((node, index) => {
      const metadata = map.get(node) ?? ({} as CompositeMetadata<Metadata>);
      newMap.set(node, { ...metadata, index });
    });

    return newMap;
  });

  // Watches for DOM reorders (e.g. a parent re-sorting its children) that
  // don't go through `register`/`unregister`, and re-sorts the index map when
  // that happens.
  createEffect(() => {
    const currentSortedMap = sortedMap();

    // A single item can't reorder.
    if (typeof MutationObserver !== 'function' || currentSortedMap.size < 2) {
      return;
    }

    // `sortedMap` is populated in sorted order, so its keys are the last known
    // document order of the items.
    const sortedNodes = Array.from(currentSortedMap.keys());

    // Rather than observing the whole composite container, observe the smallest
    // direct-child lists whose order can affect registered item order. For flat
    // lists this is the item parent; for grouped lists this includes the group
    // wrapper boundary between adjacent items.
    const roots = getAdjacentNodeRoots(sortedNodes);
    if (roots.size === 0) {
      return;
    }

    const mutationObserver = new MutationObserver((entries) => {
      // Only verify the order after a move: a node that was removed and later
      // re-added within the same batch. Additions and removals alone can't
      // change the relative order of the remaining items, and items that mount
      // or unmount re-sort through `register`/`unregister`.
      if (!hasMovedNode(entries)) {
        return;
      }

      let previousConnectedNode: Element | null = null;

      // If any connected node now appears before the previous connected node,
      // wrappers/items moved and the index map needs to be rebuilt.
      for (const node of sortedNodes) {
        if (!node.isConnected) {
          continue;
        }

        if (previousConnectedNode && sortByDocumentPosition(previousConnectedNode, node) > 0) {
          mutationObserver.disconnect();
          lastTick += 1;
          setMapTick(lastTick);
          return;
        }

        previousConnectedNode = node;
      }
    });

    roots.forEach((root) => {
      mutationObserver.observe(root, { childList: true });
    });

    onCleanup(() => {
      mutationObserver.disconnect();
    });
  });

  createEffect(() => {
    const currentSortedMap = sortedMap();
    const shouldUpdateLengths = lastTick === mapTick();
    if (shouldUpdateLengths) {
      if (props.elements.length !== currentSortedMap.size) {
        props.elements.length = currentSortedMap.size;
      }
      if (props.labels && props.labels.length !== currentSortedMap.size) {
        props.labels.length = currentSortedMap.size;
      }
      nextIndexRef.current = currentSortedMap.size;
    }

    props.onMapChange?.(currentSortedMap);
  });

  onCleanup(() => {
    props.elements.length = 0;
    if (props.labels) {
      props.labels.length = 0;
    }
  });

  const listeners = new Set<(map: Map<Element, CompositeMetadata<Metadata> | null>) => void>();

  const subscribeMapChange = (fn: (map: Map<Element, CompositeMetadata<Metadata> | null>) => void) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  };

  createEffect(() => {
    const currentSortedMap = sortedMap();
    listeners.forEach((l) => l(currentSortedMap));
  });

  const contextValue = {
    register,
    unregister,
    subscribeMapChange,
    elements: props.elements,
    labels: props.labels,
    nextIndex: nextIndexRef,
  };

  return (
    <CompositeListContext.Provider value={contextValue}>
      {props.children}
    </CompositeListContext.Provider>
  );
}

function getAdjacentNodeRoots(nodes: Element[]) {
  const roots = new Set<Element>();

  // A reorder that changes item indexes must invert at least one adjacent pair
  // from the previous sorted order. Observing each pair's common parent catches
  // both direct item moves and ancestor wrapper moves at the boundary.
  for (let i = 1; i < nodes.length; i += 1) {
    const ancestor = getCommonAncestor(nodes[i - 1], nodes[i]);

    if (ancestor) {
      roots.add(ancestor);
    }
  }

  return roots;
}

function getCommonAncestor(firstNode: Element, lastNode: Element) {
  let ancestor = firstNode.parentElement;

  // The `parentElement` walk cannot cross shadow boundaries, so the native
  // `contains` is sufficient here.
  while (ancestor && !ancestor.contains(lastNode)) {
    ancestor = ancestor.parentElement;
  }

  return ancestor;
}

function hasMovedNode(entries: MutationRecord[]) {
  const removed = new Set<Node>();

  // The records are chronological: an addition following a removal is a move,
  // while a removal following an addition is a net removal.
  for (const entry of entries) {
    for (let i = 0; i < entry.addedNodes.length; i += 1) {
      if (removed.has(entry.addedNodes[i])) {
        return true;
      }
    }

    for (let i = 0; i < entry.removedNodes.length; i += 1) {
      removed.add(entry.removedNodes[i]);
    }
  }

  // A removed node that is still connected was reparented into a container
  // this observer doesn't watch.
  for (const node of removed) {
    if (node.isConnected) {
      return true;
    }
  }

  return false;
}

function sortByDocumentPosition(a: Element, b: Element) {
  const position = a.compareDocumentPosition(b);

  if (
    position & Node.DOCUMENT_POSITION_FOLLOWING ||
    position & Node.DOCUMENT_POSITION_CONTAINED_BY
  ) {
    return -1;
  }

  if (position & Node.DOCUMENT_POSITION_PRECEDING || position & Node.DOCUMENT_POSITION_CONTAINS) {
    return 1;
  }

  return 0;
}

export interface CompositeListState {}

export namespace CompositeList {
  export type State = CompositeListState;
  export type Props<Metadata> = CompositeListProps<Metadata>;
}
