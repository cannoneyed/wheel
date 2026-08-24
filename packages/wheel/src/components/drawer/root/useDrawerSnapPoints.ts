/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createEffect, createMemo, createSignal, onCleanup, type Accessor } from 'solid-js';
import { ownerDocument } from '../../base-utils/owner';
import { clamp } from '../../internals/clamp';
import { useDrawerRootContext } from './DrawerRootContext';
import type { DrawerSnapPoint } from '../store/DrawerStore';

export interface ResolvedDrawerSnapPoint {
  value: DrawerSnapPoint;
  height: number;
  offset: number;
}

/**
 * Resolves the vertical swipe movement for a snap point, applying square-root damping once the drag
 * overshoots the fully-open edge (`nextOffset < 0`) so the popup resists travelling past it.
 */
export function getSnapPointSwipeMovement(baseOffset: number, movementValue: number): number {
  const nextOffset = baseOffset + movementValue;
  if (nextOffset >= 0) {
    return movementValue;
  }

  return -Math.sqrt(-nextOffset) - baseOffset;
}

function resolveSnapPointValue(
  snapPoint: DrawerSnapPoint,
  viewportHeight: number,
  rootFontSize: number,
) {
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) {
    return null;
  }

  if (typeof snapPoint === 'number') {
    if (!Number.isFinite(snapPoint)) {
      return null;
    }

    if (snapPoint <= 1) {
      return clamp(snapPoint, 0, 1) * viewportHeight;
    }

    return snapPoint;
  }

  const trimmed = snapPoint.trim();

  if (trimmed.endsWith('px')) {
    const value = Number.parseFloat(trimmed);
    return Number.isFinite(value) ? value : null;
  }

  if (trimmed.endsWith('rem')) {
    const value = Number.parseFloat(trimmed);
    return Number.isFinite(value) ? value * rootFontSize : null;
  }

  return null;
}

function findClosestSnapPoint(
  height: number,
  points: ResolvedDrawerSnapPoint[],
): ResolvedDrawerSnapPoint | null {
  let closest: ResolvedDrawerSnapPoint | null = null;
  let closestDistance = Infinity;

  for (const point of points) {
    const distance = Math.abs(point.height - height);
    if (distance < closestDistance) {
      closestDistance = distance;
      closest = point;
    }
  }

  return closest;
}

export interface UseDrawerSnapPointsReturnValue {
  snapPoints: Accessor<DrawerSnapPoint[] | undefined>;
  activeSnapPoint: Accessor<DrawerSnapPoint | null>;
  popupHeight: Accessor<number>;
  viewportHeight: Accessor<number>;
  resolvedSnapPoints: Accessor<ResolvedDrawerSnapPoint[]>;
  activeSnapPointOffset: Accessor<number | null>;
}

/**
 * Solid port of upstream's `useDrawerSnapPoints`. Measures the viewport element's height (falling
 * back to the document's root element) and resolves the configured `snapPoints`/`activeSnapPoint`
 * into pixel heights/offsets.
 */
export function useDrawerSnapPoints(): UseDrawerSnapPointsReturnValue {
  const store = useDrawerRootContext();
  const viewportElement = store.useState('viewportElement');
  const snapPoints = store.useState('snapPoints');
  const activeSnapPoint = store.useState('activeSnapPoint');
  const popupHeight = store.useState('popupHeight');

  const [viewportHeight, setViewportHeight] = createSignal(0);
  const [rootFontSize, setRootFontSize] = createSignal(16);

  function measureViewportHeight() {
    const element = viewportElement();
    const doc = ownerDocument(element);
    const html = doc.documentElement;

    if (element) {
      setViewportHeight(element.offsetHeight);
    } else {
      setViewportHeight(html.clientHeight);
    }

    const fontSize = Number.parseFloat(getComputedStyle(html).fontSize);
    if (Number.isFinite(fontSize)) {
      setRootFontSize(fontSize);
    }
  }

  createEffect(() => {
    const element = viewportElement();
    measureViewportHeight();

    if (!element || typeof ResizeObserver !== 'function') {
      return;
    }

    const resizeObserver = new ResizeObserver(measureViewportHeight);
    resizeObserver.observe(element);
    onCleanup(() => {
      resizeObserver.disconnect();
    });
  });

  const resolvedSnapPoints = createMemo<ResolvedDrawerSnapPoint[]>(() => {
    const points = snapPoints();
    const currentPopupHeight = popupHeight();
    const currentViewportHeight = viewportHeight();

    if (!points || points.length === 0 || currentViewportHeight <= 0 || currentPopupHeight <= 0) {
      return [];
    }

    const maxHeight = Math.min(currentPopupHeight, currentViewportHeight);
    if (!Number.isFinite(maxHeight) || maxHeight <= 0) {
      return [];
    }

    const fontSize = rootFontSize();
    const resolved = points
      .map((value): ResolvedDrawerSnapPoint | null => {
        const resolvedHeight = resolveSnapPointValue(value, currentViewportHeight, fontSize);
        if (resolvedHeight === null || !Number.isFinite(resolvedHeight)) {
          return null;
        }

        const clampedHeight = clamp(resolvedHeight, 0, maxHeight);
        return {
          value,
          height: clampedHeight,
          offset: Math.max(0, currentPopupHeight - clampedHeight),
        };
      })
      .filter((point): point is ResolvedDrawerSnapPoint => Boolean(point));

    if (resolved.length <= 1) {
      return resolved;
    }

    const deduped: ResolvedDrawerSnapPoint[] = [];
    const seenHeights: number[] = [];

    for (let index = resolved.length - 1; index >= 0; index -= 1) {
      const point = resolved[index];
      const isDuplicate = seenHeights.some((height) => Math.abs(height - point.height) <= 1);
      if (isDuplicate) {
        continue;
      }

      seenHeights.push(point.height);
      deduped.push(point);
    }

    deduped.reverse();
    return deduped;
  });

  const resolvedActiveSnapPoint = createMemo(() => {
    const current = activeSnapPoint();
    const points = resolvedSnapPoints();

    if (current === null) {
      return undefined;
    }

    const exactMatch = points.find((point) => Object.is(point.value, current));
    if (exactMatch) {
      return exactMatch;
    }

    const maxHeight = Math.min(popupHeight(), viewportHeight());
    const resolvedHeight = resolveSnapPointValue(current, viewportHeight(), rootFontSize());
    if (resolvedHeight === null || !Number.isFinite(resolvedHeight)) {
      return undefined;
    }

    const clampedHeight = clamp(resolvedHeight, 0, maxHeight);
    return findClosestSnapPoint(clampedHeight, points) ?? undefined;
  });

  return {
    snapPoints,
    activeSnapPoint,
    popupHeight,
    viewportHeight,
    resolvedSnapPoints,
    activeSnapPointOffset: () => resolvedActiveSnapPoint()?.offset ?? null,
  };
}
