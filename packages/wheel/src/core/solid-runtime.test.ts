/**
 * The provider runtime guard accepts Wheel's Solid owner and rejects an owner
 * created by a second physical Solid module.
 */
import { createRoot } from 'solid-js';
import { describe, expect, it } from 'vitest';

import { assertSingleSolidRuntime } from './solid-runtime';

describe('assertSingleSolidRuntime', () => {
  it('accepts the Solid runtime that Wheel imported', () => {
    createRoot(() => expect(() => assertSingleSolidRuntime()).not.toThrow());
  });

  it('rejects an owner from a second Solid runtime', async () => {
    const duplicateUrl = new URL('../../../../node_modules/solid-js/dist/solid.js', import.meta.url);
    const duplicateSolid = await import(
      /* @vite-ignore */ `${duplicateUrl.href}?wheel-duplicate-runtime`
    );

    duplicateSolid.createRoot(() => {
      expect(() => assertSingleSolidRuntime()).toThrow(/more than one solid-js runtime.*resolve.*dedupe/s);
    });
  });
});
