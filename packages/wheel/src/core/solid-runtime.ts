/**
 * Refuse a Wheel provider that runs under a different Solid runtime.
 *
 * Solid stores the active owner inside its module instance. A provider called
 * by another copy cannot see that owner. Continuing would make contexts and
 * delegated DOM events fail in unrelated components.
 */
import { getOwner } from 'solid-js';

/** Throw when Wheel cannot see the Solid owner that invoked its provider. */
export function assertSingleSolidRuntime(): void {
  if (getOwner() !== null) return;
  throw new Error(
    `Wheel detected more than one solid-js runtime. Add \`resolve: { dedupe: ['solid-js'] }\` ` +
      'to vite.config.ts so the app and Wheel use one runtime.'
  );
}
