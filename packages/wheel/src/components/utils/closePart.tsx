/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createContext, createSignal, onCleanup, onMount, useContext, type Accessor, type JSX } from 'solid-js';

interface ClosePartContextValue {
  register: () => () => void;
}

const ClosePartContext = createContext<ClosePartContextValue | undefined>(undefined);

/**
 * Tracks how many `Popover.Close`/`Menu.Close`-style parts are currently rendered inside a popup.
 * Solid port of upstream's `useClosePartCount`.
 *
 * Deviation: upstream's `register` is wrapped in `useStableCallback` purely so its identity stays
 * stable across re-renders for the `context`'s `useMemo` dependency array. Solid components run
 * their setup once, so `register`/`context` are already stable without that wrapper (see
 * CONVENTIONS.md's "Stable callbacks" rule).
 */
export function createClosePartCount(): {
  context: ClosePartContextValue;
  hasClosePart: Accessor<boolean>;
} {
  const [closePartCount, setClosePartCount] = createSignal(0);

  function register() {
    setClosePartCount((count) => count + 1);

    return () => {
      setClosePartCount((count) => Math.max(0, count - 1));
    };
  }

  return {
    context: { register },
    hasClosePart: () => closePartCount() > 0,
  };
}

export interface ClosePartProviderProps {
  value: ClosePartContextValue;
  children?: JSX.Element;
}

export function ClosePartProvider(props: ClosePartProviderProps): JSX.Element {
  // `props.value` is the stable `{ register }` object `createClosePartCount()` returns once and
  // never swaps for a given `Popover.Popup` instance — not a per-render-varying reactive value the
  // lint rule needs to guard, so this read (already inside the JSX it warns about) is safe as-is.
  return <ClosePartContext.Provider value={props.value}>{props.children}</ClosePartContext.Provider>;
}

/**
 * Registers the calling component (e.g. `Popover.Close`) with the nearest `ClosePartProvider` for
 * the lifetime of its mount. Solid port of upstream's `useClosePartRegistration`.
 */
export function createClosePartRegistration() {
  const context = useContext(ClosePartContext);

  onMount(() => {
    const unregister = context?.register();
    onCleanup(() => {
      unregister?.();
    });
  });
}
