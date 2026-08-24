/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import type { ToastManagerUpdateOptions } from '../useToastManager';

export function resolvePromiseOptions<T, Data extends object>(
  options:
    | string
    | ToastManagerUpdateOptions<Data>
    | ((result: T) => string | ToastManagerUpdateOptions<Data>),
  result?: T,
): ToastManagerUpdateOptions<Data> {
  if (typeof options === 'string') {
    return {
      description: options,
    };
  }

  if (typeof options === 'function') {
    const resolvedOptions = (options as (result: T) => string | ToastManagerUpdateOptions<Data>)(
      result as T,
    );
    return typeof resolvedOptions === 'string' ? { description: resolvedOptions } : resolvedOptions;
  }

  return options;
}
