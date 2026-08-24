/* eslint-disable wheel/require-export-jsdoc, wheel/require-member-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { onCleanup } from 'solid-js';
import { Timeout } from '../../base-utils/createTimeout';
import type { ContextData, FloatingRootContext } from '../types';
import type { SafePolygonOptions } from '../safePolygon';
import { isInteractiveElement } from '../utils';

export { isInteractiveElement };

/**
 * Mutable per-floating-context state shared between the reference-side and
 * floating-side hover interaction hooks. Solid port of upstream's
 * `HoverInteraction`: a plain class holding non-reactive fields (no signals
 * needed — nothing here drives a render, it's read/written from event
 * handlers and effects only).
 */
export class HoverInteraction {
  pointerType: string | undefined;
  interactedInside: boolean;
  handler: ((event: MouseEvent) => void) | undefined;
  blockMouseMove: boolean;
  performedPointerEventsMutation: boolean;
  pointerEventsScopeElement: HTMLElement | SVGSVGElement | null;
  pointerEventsReferenceElement: HTMLElement | SVGSVGElement | null;
  pointerEventsFloatingElement: HTMLElement | null;
  restTimeoutPending: boolean;
  openChangeTimeout: Timeout;
  restTimeout: Timeout;
  handleCloseOptions: SafePolygonOptions | undefined;

  constructor() {
    this.pointerType = undefined;
    this.interactedInside = false;
    this.handler = undefined;
    this.blockMouseMove = true;
    this.performedPointerEventsMutation = false;
    this.pointerEventsScopeElement = null;
    this.pointerEventsReferenceElement = null;
    this.pointerEventsFloatingElement = null;
    this.restTimeoutPending = false;
    this.openChangeTimeout = new Timeout();
    this.restTimeout = new Timeout();
    this.handleCloseOptions = undefined;
  }

  static create(): HoverInteraction {
    return new HoverInteraction();
  }

  dispose = () => {
    this.openChangeTimeout.clear();
    this.restTimeout.clear();
  };
}

type PointerEventsMutationState = Pick<
  HoverInteraction,
  | 'performedPointerEventsMutation'
  | 'pointerEventsScopeElement'
  | 'pointerEventsReferenceElement'
  | 'pointerEventsFloatingElement'
>;

const pointerEventsMutationOwnerByScopeElement = new WeakMap<
  HTMLElement | SVGSVGElement,
  PointerEventsMutationState
>();

export function clearSafePolygonPointerEventsMutation(instance: PointerEventsMutationState) {
  if (!instance.performedPointerEventsMutation) {
    return;
  }

  const scopeElement = instance.pointerEventsScopeElement;

  if (scopeElement && pointerEventsMutationOwnerByScopeElement.get(scopeElement) === instance) {
    instance.pointerEventsScopeElement?.style.removeProperty('pointer-events');
    instance.pointerEventsReferenceElement?.style.removeProperty('pointer-events');
    instance.pointerEventsFloatingElement?.style.removeProperty('pointer-events');
    pointerEventsMutationOwnerByScopeElement.delete(scopeElement);
  }

  instance.performedPointerEventsMutation = false;
  instance.pointerEventsScopeElement = null;
  instance.pointerEventsReferenceElement = null;
  instance.pointerEventsFloatingElement = null;
}

export function applySafePolygonPointerEventsMutation(
  instance: PointerEventsMutationState,
  options: {
    scopeElement: HTMLElement | SVGSVGElement;
    referenceElement: HTMLElement | SVGSVGElement;
    floatingElement: HTMLElement;
  },
) {
  const { scopeElement, referenceElement, floatingElement } = options;

  const existingOwner = pointerEventsMutationOwnerByScopeElement.get(scopeElement);
  if (existingOwner && existingOwner !== instance) {
    clearSafePolygonPointerEventsMutation(existingOwner);
  }

  clearSafePolygonPointerEventsMutation(instance);
  instance.performedPointerEventsMutation = true;
  instance.pointerEventsScopeElement = scopeElement;
  instance.pointerEventsReferenceElement = referenceElement;
  instance.pointerEventsFloatingElement = floatingElement;
  pointerEventsMutationOwnerByScopeElement.set(scopeElement, instance);

  scopeElement.style.pointerEvents = 'none';
  referenceElement.style.pointerEvents = 'auto';
  floatingElement.style.pointerEvents = 'auto';
}

type HoverContextData = ContextData & {
  hoverInteractionState?: HoverInteraction | undefined;
};

/**
 * Returns the `HoverInteraction` instance shared between
 * `useHoverReferenceInteraction` and `useHoverFloatingInteraction` for a given
 * floating root context, creating it on first use.
 *
 * Solid port of upstream's `useHoverInteractionSharedState`. Upstream memoizes
 * the instance with `useRefWithInit` (stable across re-renders of a single
 * component) and disposes it via `useOnMount`'s cleanup return; in Solid the
 * hook body runs once per call, so the instance is looked up/created directly,
 * and `onCleanup` disposes it when the *calling* reactive scope tears down.
 * Both the reference-side and floating-side hooks call this, each registering
 * its own `onCleanup` — disposing twice is safe since `Timeout.clear()` is
 * idempotent.
 */
export function useHoverInteractionSharedState(store: FloatingRootContext): HoverInteraction {
  const data = store.context.dataRef.current as HoverContextData;
  const instance = data.hoverInteractionState ?? HoverInteraction.create();

  if (!data.hoverInteractionState) {
    data.hoverInteractionState = instance;
  }

  onCleanup(instance.dispose);

  return instance;
}
