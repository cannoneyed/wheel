/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { getWindow } from '@floating-ui/utils/dom';
import { createEffect, createSignal, onCleanup } from 'solid-js';
import { access, type MaybeAccessor } from '../../internals/types';
import type { ContextData, ElementProps, FloatingContext, FloatingRootContext } from '../types';
import { contains, getTarget } from '../utils/element';
import { isMouseLikePointerType } from '../utils/event';

function createVirtualElement(
  domElement: Element | null | undefined,
  data: {
    axis: 'x' | 'y' | 'both';
    dataRef: { current: ContextData };
    pointerType: string | undefined;
    x: number | null;
    y: number | null;
  },
) {
  let offsetX: number | null = null;
  let offsetY: number | null = null;
  let isAutoUpdateEvent = false;

  return {
    contextElement: domElement || undefined,
    getBoundingClientRect() {
      const domRect = domElement?.getBoundingClientRect() || {
        width: 0,
        height: 0,
        x: 0,
        y: 0,
      };

      const isXAxis = data.axis === 'x' || data.axis === 'both';
      const isYAxis = data.axis === 'y' || data.axis === 'both';
      const canTrackCursorOnAutoUpdate =
        ['mouseenter', 'mousemove'].includes(data.dataRef.current.openEvent?.type || '') &&
        data.pointerType !== 'touch';

      let width = domRect.width;
      let height = domRect.height;
      let x = domRect.x;
      let y = domRect.y;

      if (offsetX == null && data.x && isXAxis) {
        offsetX = domRect.x - data.x;
      }

      if (offsetY == null && data.y && isYAxis) {
        offsetY = domRect.y - data.y;
      }

      x -= offsetX || 0;
      y -= offsetY || 0;
      width = 0;
      height = 0;

      if (!isAutoUpdateEvent || canTrackCursorOnAutoUpdate) {
        width = data.axis === 'y' ? domRect.width : 0;
        height = data.axis === 'x' ? domRect.height : 0;
        x = isXAxis && data.x != null ? data.x : x;
        y = isYAxis && data.y != null ? data.y : y;
      } else if (isAutoUpdateEvent && !canTrackCursorOnAutoUpdate) {
        height = data.axis === 'x' ? domRect.height : height;
        width = data.axis === 'y' ? domRect.width : width;
      }

      isAutoUpdateEvent = true;

      return {
        width,
        height,
        x,
        y,
        top: y,
        right: x + width,
        bottom: y + height,
        left: x,
      };
    },
  };
}

function isMouseBasedEvent(event: Event | undefined): event is MouseEvent {
  return event != null && (event as MouseEvent).clientX != null;
}

export interface UseClientPointProps {
  /**
   * Whether the Hook is enabled, including all internal Effects and event
   * handlers.
   * @default true
   */
  enabled?: MaybeAccessor<boolean | undefined>;
  /**
   * Whether to restrict the client point to an axis and use the reference
   * element (if it exists) as the other axis. This can be useful if the
   * floating element is also interactive.
   * @default 'both'
   */
  axis?: MaybeAccessor<'x' | 'y' | 'both' | undefined>;
}

/**
 * Positions the floating element relative to a client point (in the viewport),
 * such as the mouse position. By default, it follows the mouse cursor.
 * @see https://floating-ui.com/docs/useClientPoint
 *
 * Solid port of upstream's `useClientPoint`. Upstream memoizes `reference`
 * via `useMemo` and only exposes `{ reference, trigger: reference }` when
 * `enabled`, falling back to `{}` otherwise — re-running that gate would
 * require re-running hook setup, which Solid hooks don't do. Following the
 * precedent set by `useClick`'s port, `reference`/`trigger` are instead a
 * single stable plain object (handler-only, per the locked hook-return
 * convention) whose handlers check `enabled()` first and no-op when
 * disabled — same observable behavior, stable identity.
 */
export function useClientPoint(
  context: FloatingRootContext | FloatingContext,
  props: UseClientPointProps = {},
): ElementProps {
  const enabled = () => access(props.enabled) ?? true;
  const axis = () => access(props.axis) ?? 'both';

  const store = 'rootStore' in context ? context.rootStore : context;

  const open = store.useState('open');
  const floating = store.useState('floatingElement');
  const domReference = store.useState('domReferenceElement');

  const dataRef = store.context.dataRef;

  let initial = false;
  let cleanupListener: (() => void) | null = null;

  const [pointerType, setPointerType] = createSignal<string | undefined>(undefined);
  // Forces the main effect to re-run so it (re-)attaches the global
  // `mousemove` listener, mirroring upstream's `setReactive([])` trick.
  const [reactiveTrigger, setReactiveTrigger] = createSignal(0);

  const resetReference = (reference: Element | null) => {
    store.set('positionReference', reference);
  };

  const setReference = (
    newX: number | null,
    newY: number | null,
    referenceElement?: Element | null,
  ) => {
    if (initial) {
      return;
    }

    // Prevent setting if the open event was not a mouse-like one
    // (e.g. focus to open, then hover over the reference element).
    // Only apply if the event exists.
    if (dataRef.current.openEvent && !isMouseBasedEvent(dataRef.current.openEvent)) {
      return;
    }

    store.set(
      'positionReference',
      createVirtualElement(referenceElement ?? domReference(), {
        x: newX,
        y: newY,
        axis: axis(),
        dataRef,
        pointerType: pointerType(),
      }),
    );
  };

  const handleReferenceEnterOrMove = (event: MouseEvent) => {
    if (!enabled()) {
      return;
    }
    if (!open()) {
      setReference(event.clientX, event.clientY, event.currentTarget as Element);
    } else if (!cleanupListener) {
      // If there's no cleanup, there's no listener, but we want to ensure
      // we add the listener if the cursor landed on the floating element and
      // then back on the reference (i.e. it's interactive).
      setReference(event.clientX, event.clientY, event.currentTarget as Element);
      setReactiveTrigger((value) => value + 1);
    }
  };

  // If the pointer is a mouse-like pointer, we want to continue following the
  // mouse even if the floating element is transitioning out. On touch
  // devices, this is undesirable because the floating element will move to
  // the dismissal touch point.
  const openCheck = () => (isMouseLikePointerType(pointerType()) ? floating() : open());

  createEffect(() => {
    reactiveTrigger();

    if (!enabled()) {
      resetReference(domReference());
      return;
    }

    if (!openCheck()) {
      return;
    }

    function clearListener() {
      cleanupListener?.();
      cleanupListener = null;
    }

    const win = getWindow(floating());

    function handleMouseMove(event: MouseEvent) {
      const target = getTarget(event) as Element | null;

      if (!contains(floating(), target)) {
        setReference(event.clientX, event.clientY);
      } else {
        clearListener();
      }
    }

    if (!dataRef.current.openEvent || isMouseBasedEvent(dataRef.current.openEvent)) {
      win.addEventListener('mousemove', handleMouseMove);
      // Stored for later imperative invocation (see `clearListener` above),
      // not itself a reactive computation — the lint rule flags it anyway
      // because `handleMouseMove` transitively reads signals.
      cleanupListener = () => win.removeEventListener('mousemove', handleMouseMove);
    } else {
      resetReference(domReference());
    }

    onCleanup(clearListener);
  });

  // Clear virtual cursor references when the hook unmounts. Enabled flips are handled above.
  onCleanup(() => {
    store.set('positionReference', null);
  });

  createEffect(() => {
    if (enabled() && !floating()) {
      initial = false;
    }
  });

  createEffect(() => {
    if (!enabled() && open()) {
      initial = true;
    }
  });

  function setPointerTypeRef(event: PointerEvent) {
    if (!enabled()) {
      return;
    }
    setPointerType(event.pointerType);
  }

  const reference: ElementProps['reference'] = {
    onPointerDown: setPointerTypeRef,
    onPointerEnter: setPointerTypeRef,
    onMouseMove: handleReferenceEnterOrMove,
    onMouseEnter: handleReferenceEnterOrMove,
  };

  return {
    reference,
    trigger: reference,
  };
}
