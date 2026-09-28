/**
 * The Wheel app config: JSON only, frozen, entering at the root, inherited
 * by child scopes, and parsed per section with defaults.
 */
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ServiceContext } from './services';
import { WheelConfigService, defineWheelConfig } from './app-config';

// A test-only section, declared the way a package declares its own.
const probeSchema = z.strictObject({ mode: z.enum(['a', 'b']).default('a'), size: z.number().default(3) });
declare module './index' {
  interface WheelAppConfig {
    readonly probe?: z.input<typeof probeSchema>;
  }
}

describe('defineWheelConfig', () => {
  it('returns a frozen copy', () => {
    const input = { probe: { mode: 'b' as const } };
    const config = defineWheelConfig(input);
    expect(config).toEqual(input);
    expect(config).not.toBe(input);
    expect(Object.isFrozen(config.probe)).toBe(true);
  });

  it('rejects anything that is not JSON, naming the path', () => {
    const withFunction = { probe: { mode: 'a', render: () => null } } as never;
    expect(() => defineWheelConfig(withFunction)).toThrow(/config\.probe\.render is a function/);
    expect(() => defineWheelConfig({ probe: { size: Number.NaN } })).toThrow(/finite number/);
  });
});

describe('WheelConfigService', () => {
  it('fills defaults for a missing section, and parses a given one', () => {
    const empty = new ServiceContext({ scopeId: 'empty' });
    const given = new ServiceContext({ scopeId: 'given', config: defineWheelConfig({ probe: { mode: 'b' } }) });
    try {
      expect(empty.get(WheelConfigService).section('probe', probeSchema)).toEqual({ mode: 'a', size: 3 });
      expect(given.get(WheelConfigService).section('probe', probeSchema)).toEqual({ mode: 'b', size: 3 });
    } finally {
      empty.dispose();
      given.dispose();
    }
  });

  it('names the section and field of a bad value', () => {
    const context = new ServiceContext({ scopeId: 'bad', config: { probe: { mode: 'c' } } as never });
    try {
      expect(() => context.get(WheelConfigService).section('probe', probeSchema)).toThrow(
        /Invalid wheel config: probe\.mode/
      );
    } finally {
      context.dispose();
    }
  });

  it('child scopes inherit the root config and may not set their own', () => {
    const root = new ServiceContext({ scopeId: 'root', config: defineWheelConfig({ probe: { size: 9 } }) });
    try {
      const child = root.child({ scopeId: 'pane', inheritServices: false });
      expect(child.get(WheelConfigService).section('probe', probeSchema).size).toBe(9);
      expect(() => root.child({ config: defineWheelConfig({}) })).toThrow(/config enters at the root only/);
    } finally {
      root.dispose();
    }
  });
});
