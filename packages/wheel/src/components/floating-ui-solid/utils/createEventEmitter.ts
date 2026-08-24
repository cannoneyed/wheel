/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import type { FloatingEvents } from '../types';

export function createEventEmitter(): FloatingEvents {
  const map = new Map<string, Set<(data: any) => void>>();
  return {
    emit(event: string, data: any) {
      map.get(event)?.forEach((listener) => listener(data));
    },
    on(event: string, listener: (data: any) => void) {
      if (!map.has(event)) {
        map.set(event, new Set());
      }
      map.get(event)!.add(listener);
    },
    off(event: string, listener: (data: any) => void) {
      map.get(event)?.delete(listener);
    },
  };
}
