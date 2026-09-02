/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createMemo, createSignal, untrack, type Accessor } from 'solid-js';
import { warn } from './warn';

export interface CreateControllableSignalParams<T> {
  /**
   * Accessor for the controlled prop value. Returning `undefined` means the
   * component is uncontrolled.
   */
  controlled: Accessor<T | undefined>;
  /**
   * The default (uncontrolled) value, read once at setup.
   */
  default: T;
  /**
   * The component name used in dev warnings.
   */
  name?: string;
  /**
   * The state variable name used in dev warnings.
   */
  state?: string;
}

/**
 * Solid port of upstream's `useControlled`: a signal that defers to a
 * controlled prop when provided, and manages its own state otherwise.
 * Whether the component is controlled is decided once, on first run, and
 * switching after that logs a dev warning (matching upstream behavior).
 *
 * This is where a library component's OWN state lives — `checked`, `open`,
 * `value`. The component tree sees it through the part's `state` object, which
 * `renderElement` hands to `use:viewRoot`; nothing needs registering here.
 */
export function createControllableSignal<T>(
  params: CreateControllableSignalParams<T>,
): [Accessor<T>, (next: T | ((prev: T) => T)) => void] {
  const { controlled, name = 'a component', state = 'value' } = params;

  const isControlled = untrack(controlled) !== undefined;
  const [uncontrolledValue, setUncontrolledValue] = createSignal(params.default);

  const value = createMemo(() =>
    isControlled ? (controlled() as T) : uncontrolledValue(),
  );

  if (process.env.NODE_ENV !== 'production') {
    createMemo(() => {
      const controlledNow = controlled() !== undefined;
      if (isControlled !== controlledNow) {
        warn(
          `A component is changing the ${
            isControlled ? '' : 'un'
          }controlled ${state} state of ${name} to be ${isControlled ? 'un' : ''}controlled.`,
          'Elements should not switch from uncontrolled to controlled (or vice versa).',
          `Decide between using a controlled or uncontrolled ${name} element for the lifetime of the component.`,
        );
      }
      return controlledNow;
    });
  }

  const setValue = (next: T | ((prev: T) => T)) => {
    if (!isControlled) {
      setUncontrolledValue(next as Exclude<T, Function> | ((prev: T) => T));
    }
  };

  return [value, setValue];
}
