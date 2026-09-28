/**
 * The Wheel app config: one typed object that sets app-wide behavior.
 *
 * Settings that belong to the WHOLE app — which keys open the command
 * palette, how keys match, how context menus draw submenus — used to be
 * props on components mounted once at the root. A prop on a global
 * component is config in disguise: it hides in the JSX, two mounts can
 * disagree, and a test or an agent cannot read it without rendering.
 *
 * Instead, an app writes ONE file, `src/wheel.config.ts`:
 *
 *   export default defineWheelConfig({
 *     commandPalette: { openKeyCommand: 'mod+shift+p' }
 *   });
 *
 * and passes it to the root, the one place config enters:
 *
 *   <WheelApp client={client} config={wheelConfig}>
 *
 * `WheelConfigService` reads it. Child scopes inherit it. A test passes its
 * own with `new ServiceContext({ config })`.
 *
 * Each package owns its SECTIONS. It adds the section's type to
 * `WheelAppConfig` with module augmentation, and reads it through
 * `WheelConfigService.section(key, schema)` with a Zod schema whose
 * defaults keep today's behavior. An app with no config behaves exactly as
 * it did before.
 *
 * Config is JSON: strings, numbers, booleans, arrays, plain objects. That
 * keeps it loggable, diffable, and overridable from a URL or a server with
 * `wheel/config` sources.
 *
 * Config is app-wide BEHAVIOR (which keys, which mode, where to save). How
 * something LOOKS — a render function such as `<ToastSystem renderToast>` —
 * is view customization and stays a prop on the component that draws it.
 */
import type { z } from 'zod';

import { Service } from './services';
// Declared in the package entry so apps and packages can augment it as
// `declare module 'wheel/core'`.
import type { WheelAppConfig } from './index';


/** Throw unless `value` survives JSON unchanged (see the module doc). */
function assertJson(value: unknown, path: string): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`wheel config: ${path} is not a finite number.`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJson(item, `${path}[${index}]`));
    return;
  }
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (item !== undefined) assertJson(item, `${path}.${key}`);
    }
    return;
  }
  const kind = typeof value === 'function' ? 'a function' : `a ${typeof value}`;
  throw new TypeError(
    `wheel config: ${path} is ${kind}. Config is JSON only; register functions on the owning service instead.`
  );
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}

/**
 * Declare the app's Wheel config. Checks that it is JSON and freezes it.
 * The one convention: `src/wheel.config.ts` default-exports this.
 */
export function defineWheelConfig(config: WheelAppConfig): WheelAppConfig {
  assertJson(config, 'config');
  return freeze(structuredClone(config));
}

/**
 * Read-only access to the app config. Sections are parsed with their
 * owner's schema the first time they are read, so a bad value fails loudly
 * with its path, and a missing value takes its default.
 */
export class WheelConfigService extends Service {
  /** Identity that survives minification (see require-service-name). */
  static override serviceName = 'WheelConfigService';

  /** State-tree group: wheel-internal plumbing, collapsed by default. */
  static override group = 'framework';

  private readonly parsed = new Map<string, unknown>();

  /** The raw config, exactly as the root received it. */
  get config(): WheelAppConfig {
    return this.context.config;
  }

  /**
   * One section, parsed with `schema` (defaults applied). Throws on an
   * invalid value, naming the section and field.
   */
  section<Schema extends z.ZodType>(key: keyof WheelAppConfig & string, schema: Schema): z.output<Schema> {
    if (this.parsed.has(key)) return this.parsed.get(key) as z.output<Schema>;
    const raw = (this.context.config as Record<string, unknown>)[key];
    const result = schema.safeParse(raw ?? {});
    if (!result.success) {
      const issues = result.error.issues
        .map((issue) => `${[key, ...issue.path.map(String)].join('.')}: ${issue.message}`)
        .join('; ');
      throw new Error(`Invalid wheel config: ${issues}`);
    }
    this.parsed.set(key, result.data);
    return result.data as z.output<Schema>;
  }
}
