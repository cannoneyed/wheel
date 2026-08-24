/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, createUniqueId, onCleanup, untrack, useContext, type JSX } from 'solid-js';
import type { FloatingNodeType, FloatingTreeType } from '../types';
import { FloatingTreeStore } from './FloatingTreeStore';

const FloatingNodeContext = createContext<FloatingNodeType | null>(null);
const FloatingTreeContext = createContext<FloatingTreeType | null>(null);

/**
 * Returns the parent node id for nested floating elements, if available.
 * Returns `null` for top-level floating elements.
 */
export const useFloatingParentNodeId = (): string | null => useContext(FloatingNodeContext)?.id || null;

/**
 * Returns the nearest floating tree context, if available.
 */
export const useFloatingTree = (externalTree?: FloatingTreeStore): FloatingTreeType | null => {
  const contextTree = useContext(FloatingTreeContext);
  return externalTree ?? contextTree;
};

/**
 * Registers a node into the `FloatingTree`, returning its id.
 * @see https://floating-ui.com/docs/FloatingTree
 *
 * Solid components run their setup once, so registration happens
 * synchronously at call time (the Solid analog of upstream's layout effect)
 * instead of inside `onMount`; `onCleanup` unregisters the node when the
 * owning scope is disposed.
 */
export function useFloatingNodeId(externalTree?: FloatingTreeStore): string | undefined {
  const id = `base-ui-${createUniqueId()}`;
  const tree = useFloatingTree(externalTree);
  const parentId = useFloatingParentNodeId();

  const node: FloatingNodeType = { id, parentId };
  tree?.addNode(node);
  onCleanup(() => {
    tree?.removeNode(node);
  });

  return id;
}

export interface FloatingNodeProps {
  children?: JSX.Element;
  id: string | undefined;
}

/**
 * Provides parent node context for nested floating elements.
 * @see https://floating-ui.com/docs/FloatingTree
 * @internal
 */
export function FloatingNode(props: FloatingNodeProps): JSX.Element {
  const parentId = useFloatingParentNodeId();

  return (
    <FloatingNodeContext.Provider
      value={{
        get id() {
          return props.id;
        },
        parentId,
      }}
    >
      {props.children}
    </FloatingNodeContext.Provider>
  );
}

export interface FloatingTreeProps {
  children?: JSX.Element;
  externalTree?: FloatingTreeStore | undefined;
}

/**
 * Provides context for nested floating elements when they are not children of
 * each other on the DOM.
 * This is not necessary in all cases, except when there must be explicit communication between parent and child floating elements. It is necessary for:
 * - The `bubbles` option in the `useDismiss()` Hook
 * - Nested virtual list navigation
 * - Nested floating elements that each open on hover
 * - Custom communication between parent and child floating elements
 * @see https://floating-ui.com/docs/FloatingTree
 * @internal
 */
export function FloatingTree(props: FloatingTreeProps): JSX.Element {
  // Intentionally read once: the tree is constructed at setup time and never
  // swapped, mirroring upstream's `useRefWithInit`.
  const tree = untrack(() => props.externalTree) ?? new FloatingTreeStore();
  return (
    <FloatingTreeContext.Provider value={tree}>{props.children}</FloatingTreeContext.Provider>
  );
}
