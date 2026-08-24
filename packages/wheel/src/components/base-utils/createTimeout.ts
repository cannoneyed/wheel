/* eslint-disable wheel/require-export-jsdoc, wheel/require-member-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { onCleanup } from 'solid-js';
import { componentRuntime } from './runtime';

type TimeoutId = ReturnType<typeof globalThis.setTimeout>;

const EMPTY = null;

export class Timeout {
  static create() {
    return new Timeout();
  }

  currentId: TimeoutId | null = EMPTY;

  /**
   * Executes `fn` after `delay`, clearing any previously scheduled call.
   */
  start(delay: number, fn: Function) {
    this.clear();
    this.currentId = componentRuntime.scheduleTimeout(() => {
      this.currentId = EMPTY;
      fn();
    }, delay);
  }

  isStarted() {
    return this.currentId !== EMPTY;
  }

  clear = () => {
    if (this.currentId !== EMPTY) {
      componentRuntime.cancelTimeout(this.currentId);
      this.currentId = EMPTY;
    }
  };
}

/**
 * A delayed callback with automatic cleanup when the owning reactive scope is disposed.
 * Solid port of upstream's `useTimeout`.
 */
export function createTimeout() {
  const timeout = Timeout.create();
  onCleanup(timeout.clear);
  return timeout;
}
