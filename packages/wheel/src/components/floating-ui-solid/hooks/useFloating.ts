import { isElement } from '@floating-ui/utils/dom';
import type { VirtualElement } from '@floating-ui/dom';
import { createComputed, createEffect, createSignal, type Accessor } from 'solid-js';
import { usePosition } from './usePosition';
import { useFloatingRootContext } from './useFloatingRootContext';
import { useFloatingTree } from '../components/FloatingTree';
import type {
  ExtendedElements,
  ExtendedRefs,
  FloatingContext,
  NarrowedElement,
  ReferenceType,
  UseFloatingOptions,
  UseFloatingReturn,
} from '../types';

/**
 * Provides data to position a floating element and context to add interactions.
 * @see https://floating-ui.com/docs/useFloating
 *
 * Solid port of upstream's `useFloating`. Upstream re-derives `refs`/
 * `elements`/`context` every render via `useMemo` because a new render means
 * new object identities are cheap to produce and comparing accessors would be
 * pointless; here they're built once (hook setup runs once) as plain objects
 * whose fields are themselves `Accessor`s, so identity is stable and reads
 * stay fine-grained reactive.
 */
export function useFloating(options: UseFloatingOptions = {}): UseFloatingReturn {
  const nodeId = options.nodeId;

  const internalStore = useFloatingRootContext(options);
  const store = options.rootContext || internalStore;

  const referenceElement = store.useState('referenceElement');
  const floatingElement = store.useState('floatingElement');
  const domReferenceElement = store.useState('domReferenceElement');
  const open = store.useState('open');
  const floatingId = store.useState('floatingId');

  const [positionReference, setPositionReferenceSignal] = createSignal<ReferenceType | null>(
    null,
  );
  const [localDomReference, setLocalDomReferenceSignal] = createSignal<
    NarrowedElement<ReferenceType> | null | undefined
  >(undefined);
  const [localFloatingElement, setLocalFloatingElementSignal] = createSignal<
    HTMLElement | null | undefined
  >(undefined);

  const tree = useFloatingTree(options.externalTree);

  const positionReferenceElement: Accessor<ReferenceType | null> = () =>
    positionReference() ?? referenceElement();

  const localDomReferenceElement: Accessor<Element | null> = () => {
    const local = localDomReference();
    return isElement(local) ? (local as Element) : null;
  };

  const syncedFloatingElement: Accessor<HTMLElement | null> = () => {
    const local = localFloatingElement();
    return local === undefined ? floatingElement() : local;
  };

  // These arguments are read from inside `store.syncValue`, which wraps them
  // in a `createComputed` internally — the lint rule can't trace through
  // that custom API, so it (incorrectly) flags them as untracked reads.
  store.syncValue('referenceElement', () => localDomReference() ?? null);
  store.syncValue('domReferenceElement', () =>
    localDomReference() === undefined ? domReferenceElement() : localDomReferenceElement(),
  );
  store.syncValue('floatingElement', syncedFloatingElement);

  const position = usePosition({
    placement: options.placement,
    strategy: options.strategy,
    middleware: options.middleware,
    transform: options.transform,
    whileElementsMounted: options.whileElementsMounted,
    open,
    elements: {
      reference: positionReferenceElement,
      floating: floatingElement,
    },
  });

  const refs: ExtendedRefs = {
    reference: { current: null },
    floating: { current: null },
    domReference: { current: null },
    setReference(node) {
      if (isElement(node) || node === null) {
        refs.domReference.current = node as NarrowedElement<ReferenceType> | null;
        setLocalDomReferenceSignal(node as NarrowedElement<ReferenceType> | null);
      }

      // Backwards-compatibility for passing a virtual element to `reference`
      // after it has set the DOM reference.
      const currentReference = refs.reference.current;
      const shouldUpdate =
        isElement(currentReference) ||
        currentReference === null ||
        // Don't allow setting virtual elements using the old technique back to
        // `null` to support `positionReference` + an unstable `reference`
        // callback ref.
        (node !== null && !isElement(node));

      if (shouldUpdate) {
        refs.reference.current = node;
        setPositionReferenceSignal(isElement(node) ? null : node);
      }
    },
    setFloating(node) {
      refs.floating.current = node;
      setLocalFloatingElementSignal(node);
    },
    setPositionReference(node) {
      const computedPositionReference = isElement(node)
        ? ({
            getBoundingClientRect: () => (node as Element).getBoundingClientRect(),
            getClientRects: () => (node as Element).getClientRects(),
            contextElement: node as Element,
          } satisfies VirtualElement)
        : node;
      refs.reference.current = computedPositionReference;
      setPositionReferenceSignal(computedPositionReference);
    },
  };

  // Keeps `refs.reference`/`refs.floating` current when the resolved element
  // changes for reasons other than calling the setters above (e.g. an
  // externally-controlled `elements` option).
  createComputed(() => {
    const referenceValue = positionReferenceElement();
    if (referenceValue) {
      refs.reference.current = referenceValue;
    }
  });
  createComputed(() => {
    const floatingValue = floatingElement();
    if (floatingValue) {
      refs.floating.current = floatingValue;
    }
  });

  const elements: ExtendedElements = {
    reference: positionReferenceElement,
    floating: floatingElement,
    domReference: domReferenceElement,
  };

  const context: FloatingContext = {
    x: position.x,
    y: position.y,
    placement: position.placement,
    strategy: position.strategy,
    middlewareData: position.middlewareData,
    isPositioned: position.isPositioned,
    floatingStyles: position.floatingStyles,
    update: position.update,
    dataRef: store.context.dataRef,
    open,
    onOpenChange: store.setOpen,
    events: store.context.events,
    floatingId,
    refs,
    elements,
    nodeId,
    rootStore: store,
  };

  createEffect(() => {
    const domRef = domReferenceElement();
    if (domRef) {
      refs.domReference.current = domRef as NarrowedElement<ReferenceType> | null;
    }
  });

  createEffect(() => {
    store.context.dataRef.current.floatingContext = context;

    const node = tree?.nodesRef.current.find((n) => n.id === nodeId);
    if (node) {
      node.context = context;
    }
  });

  return {
    x: position.x,
    y: position.y,
    placement: position.placement,
    strategy: position.strategy,
    middlewareData: position.middlewareData,
    isPositioned: position.isPositioned,
    floatingStyles: position.floatingStyles,
    update: position.update,
    context,
    refs,
    elements,
    rootStore: store,
  };
}
