/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createContext, createEffect, createSignal, onCleanup, useContext, type Accessor, type JSX } from 'solid-js';
import { createTimeout, Timeout } from '../../base-utils/createTimeout';
import { access, type MaybeAccessor } from '../../internals/types';
import {
  createChangeEventDetails,
  type BaseUIChangeEventDetails,
} from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import { getDelay } from '../hooks/useHoverShared';
import type { Delay, FloatingContext, FloatingRootContext } from '../types';

interface OnOpenChangeContext {
  onOpenChange: (open: boolean, eventDetails: BaseUIChangeEventDetails<string>) => void;
  setIsInstantPhase: (value: boolean) => void;
}

interface FloatingDelayGroupContextValue {
  hasProvider: boolean;
  /**
   * `timeoutMs` is a caller-controlled prop, so (unlike the plain mutable
   * refs below) it's threaded through as an accessor to stay reactive.
   */
  timeoutMs: Accessor<number>;
  delayRef: { current: Delay };
  initialDelayRef: { current: Delay };
  timeout: Timeout;
  currentIdRef: { current: string | null };
  currentContextRef: { current: OnOpenChangeContext | null };
}

const FloatingDelayGroupContext = createContext<FloatingDelayGroupContextValue>({
  hasProvider: false,
  timeoutMs: () => 0,
  delayRef: { current: 0 },
  initialDelayRef: { current: 0 },
  timeout: new Timeout(),
  currentIdRef: { current: null },
  currentContextRef: { current: null },
});

export interface FloatingDelayGroupProps {
  children?: JSX.Element;
  /**
   * The delay to use for the group when it's not in the instant phase.
   */
  delay: MaybeAccessor<Delay>;
  /**
   * An optional explicit timeout to use for the group, which represents when
   * grouping logic will no longer be active after the close delay completes.
   * This is useful if you want grouping to “last” longer than the close delay,
   * for example if there is no close delay at all.
   */
  timeoutMs?: MaybeAccessor<number | undefined>;
}

/**
 * Experimental next version of `FloatingDelayGroup` to become the default
 * in the future. This component is not yet stable.
 * Provides context for a group of floating elements that should share a
 * `delay`.
 * @see https://floating-ui.com/docs/FloatingDelayGroup
 * @internal
 */
export function FloatingDelayGroup(props: FloatingDelayGroupProps): JSX.Element {
  const delay = () => access(props.delay);
  const timeoutMs = () => access(props.timeoutMs) ?? 0;

  // Placeholder initial values — the `createEffect` below runs synchronously
  // on setup and immediately overwrites both with `access(props.delay)`, so
  // reading the reactive `delay` prop here (outside a tracked scope) is
  // unnecessary.
  const delayRef: { current: Delay } = { current: 0 };
  const initialDelayRef: { current: Delay } = { current: 0 };
  const currentIdRef: { current: string | null } = { current: null };
  const currentContextRef: { current: OnOpenChangeContext | null } = { current: null };
  const timeout = createTimeout();

  createEffect(() => {
    const nextDelay = delay();
    initialDelayRef.current = nextDelay;

    if (!currentIdRef.current) {
      delayRef.current = nextDelay;
      return;
    }

    delayRef.current = {
      open: getDelay(delayRef.current, 'open'),
      close: getDelay(nextDelay, 'close'),
    };
  });

  const contextValue: FloatingDelayGroupContextValue = {
    hasProvider: true,
    delayRef,
    initialDelayRef,
    currentIdRef,
    timeoutMs,
    currentContextRef,
    timeout,
  };

  return (
    <FloatingDelayGroupContext.Provider value={contextValue}>
      {props.children}
    </FloatingDelayGroupContext.Provider>
  );
}

export interface UseDelayGroupOptions {
  /**
   * Whether the trigger this hook is used in has opened the tooltip.
   */
  open?: MaybeAccessor<boolean> | undefined;
}

export interface UseDelayGroupReturn {
  /**
   * The delay reference object.
   */
  delayRef: { current: Delay };
  /**
   * Whether animations should be removed.
   */
  isInstantPhase: Accessor<boolean>;
  /**
   * Whether a `<FloatingDelayGroup>` provider is present.
   */
  hasProvider: boolean;
}

/**
 * Enables grouping when called inside a component that's a child of a
 * `FloatingDelayGroup`.
 * @see https://floating-ui.com/docs/FloatingDelayGroup
 * @internal
 */
export function useDelayGroup(
  context: FloatingRootContext | FloatingContext,
  options: UseDelayGroupOptions = {},
): UseDelayGroupReturn {
  const open = () => access(options.open) ?? false;

  const store = 'rootStore' in context ? context.rootStore : context;
  const floatingId = store.useState('floatingId');

  const groupContext = useContext(FloatingDelayGroupContext);
  const {
    currentIdRef,
    delayRef,
    timeoutMs,
    initialDelayRef,
    currentContextRef,
    hasProvider,
    timeout,
  } = groupContext;

  const [isInstantPhase, setIsInstantPhase] = createSignal(false);
  let openRef = open();
  let isUnmounted = false;

  createEffect(() => {
    openRef = open();
  });

  onCleanup(() => {
    isUnmounted = true;
  });

  createEffect(() => {
    const isOpen = open();
    const id = floatingId();

    function unset() {
      if (!isUnmounted) {
        setIsInstantPhase(false);
      }
      currentContextRef.current?.setIsInstantPhase(false);
      currentIdRef.current = null;
      currentContextRef.current = null;
      delayRef.current = initialDelayRef.current;
      timeout.clear();
    }

    if (!currentIdRef.current) {
      return;
    }

    if (!isOpen && currentIdRef.current === id) {
      setIsInstantPhase(false);

      if (timeoutMs()) {
        const closingId = id;
        timeout.start(timeoutMs(), () => {
          // If another tooltip has taken over the group, skip resetting.
          if (store.state.open || (currentIdRef.current && currentIdRef.current !== closingId)) {
            return;
          }
          unset();
        });
        onCleanup(() => {
          if (openRef || currentIdRef.current !== closingId) {
            timeout.clear();
          }
        });
        return;
      }

      unset();
    }
  });

  createEffect(() => {
    const isOpen = open();
    const id = floatingId();

    if (!isOpen) {
      return;
    }

    const prevContext = currentContextRef.current;
    const prevId = currentIdRef.current;

    // A new tooltip is opening, so cancel any pending timeout that would reset
    // the group's delay back to the initial value.
    timeout.clear();
    currentContextRef.current = { onOpenChange: store.setOpen, setIsInstantPhase };
    currentIdRef.current = id ?? null;
    delayRef.current = {
      open: 0,
      close: getDelay(initialDelayRef.current, 'close'),
    };

    if (prevId !== null && prevId !== id) {
      setIsInstantPhase(true);
      prevContext?.setIsInstantPhase(true);
      prevContext?.onOpenChange(false, createChangeEventDetails(REASONS.none));
    } else {
      setIsInstantPhase(false);
      prevContext?.setIsInstantPhase(false);
    }
  });

  onCleanup(() => {
    const id = floatingId();
    if (currentIdRef.current === id) {
      currentContextRef.current = null;

      if (!openRef) {
        return;
      }

      currentIdRef.current = null;
      delayRef.current = initialDelayRef.current;
      timeout.clear();
    }
  });

  return {
    hasProvider,
    delayRef,
    isInstantPhase,
  };
}
