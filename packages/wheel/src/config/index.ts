/**
 * Small, JSON-only application configuration.
 *
 * A definition is one Zod schema. Sources return partial top-level objects and
 * are applied in declaration order; later sources replace earlier fields.
 * The final object is validated once, then can be serialized through the same
 * JSON boundary.
 */
import { z } from 'zod';

/** A value that survives JSON serialization without coercion or data loss. */
export type ConfigJson =
  | null
  | boolean
  | number
  | string
  | readonly ConfigJson[]
  | { readonly [key: string]: ConfigJson };

/** One named, testable source of partial top-level configuration fields. */
export interface ConfigSource {
  /** Name included in source-load and JSON-boundary errors. */
  readonly name: string;
  /** Return a partial object, or `undefined` when this source is absent. */
  load(): unknown | Promise<unknown>;
}

/** The inferred API produced by `defineConfig(schema)`. */
export interface ConfigDefinition<Schema extends z.ZodType> {
  /** The one schema used for loading, parsing, and deserialization. */
  readonly schema: Schema;
  /** Validate one already-composed value. */
  parse(value: unknown): z.output<Schema>;
  /**
   * Load sources sequentially. Later sources replace earlier top-level fields;
   * nested objects and arrays are replaced whole, never deep-merged.
   */
  load(sources: readonly ConfigSource[]): Promise<z.output<Schema>>;
  /** Validate and serialize a config value through the strict JSON boundary. */
  serialize(value: z.input<Schema>): string;
  /** Parse JSON text, then validate it with the definition's schema. */
  deserialize(json: string): z.output<Schema>;
}

/** Options for bootstrapped data such as `window.__WHEEL_CONFIG__`. */
export interface BootstrapConfigSourceOptions {
  /** Property holding the bootstrapped object. Defaults to `__WHEEL_CONFIG__`. */
  readonly key?: string;
  /** Object to read. Defaults to `globalThis`; inject a plain object in tests. */
  readonly host?: Record<string, unknown>;
  /** Diagnostic source name. */
  readonly name?: string;
}

/** Options for a JSON configuration endpoint. */
export interface FetchConfigSourceOptions {
  /** Injected fetch implementation. Defaults to `globalThis.fetch`. */
  readonly fetch?: typeof globalThis.fetch;
  /** Standard request options such as credentials and headers. */
  readonly init?: RequestInit;
  /** Diagnostic source name. */
  readonly name?: string;
}

/** Options for top-level URL query configuration. */
export interface UrlConfigSourceOptions {
  /**
   * Search text, params, or a lazy reader. Defaults to `location.search`.
   * The lazy form keeps browser state out of module initialization.
   */
  readonly search?: string | URLSearchParams | (() => string | URLSearchParams);
  /**
   * Optional key prefix. `config.` maps `config.debug=true` to `debug: true`
   * and ignores unrelated query parameters.
   */
  readonly prefix?: string;
  /** Diagnostic source name. */
  readonly name?: string;
}

/**
 * Define one application configuration contract. Zod defaults run after all
 * sources merge, so a missing field can still receive its schema default.
 */
export function defineConfig<Schema extends z.ZodType>(
  schema: Schema
): ConfigDefinition<Schema> {
  return {
    schema,
    parse: (value) => parseConfig(schema, value),
    async load(sources) {
      const merged: Record<string, ConfigJson> = Object.create(null) as Record<
        string,
        ConfigJson
      >;
      for (const source of sources) {
        let value: unknown;
        try {
          value = await source.load();
        } catch (error) {
          throw new Error(`Configuration source '${source.name}' failed: ${errorMessage(error)}`, {
            cause: error
          });
        }
        if (value === undefined) continue;
        assertJson(value, `configuration source '${source.name}'`);
        if (!isPlainObject(value)) {
          throw new TypeError(`Configuration source '${source.name}' must return a JSON object`);
        }
        Object.assign(merged, value);
      }
      return parseConfig(schema, merged);
    },
    serialize(value) {
      const parsed = parseConfig(schema, value);
      assertJson(parsed, 'configuration schema output');
      return JSON.stringify(parsed);
    },
    deserialize(json) {
      let value: unknown;
      try {
        value = JSON.parse(json);
      } catch (error) {
        throw new SyntaxError(`Configuration JSON is invalid: ${errorMessage(error)}`, {
          cause: error
        });
      }
      return parseConfig(schema, value);
    }
  };
}

/** A fixed source for defaults, server-injected objects, and focused tests. */
export function valueConfigSource(name: string, value: unknown): ConfigSource {
  return { name, load: () => value };
}

/** Read a bootstrapped object from `globalThis`/`window` or an injected host. */
export function bootstrapConfigSource(
  options: BootstrapConfigSourceOptions = {}
): ConfigSource {
  const key = options.key ?? '__WHEEL_CONFIG__';
  const host = options.host ?? (globalThis as unknown as Record<string, unknown>);
  return {
    name: options.name ?? `bootstrap:${key}`,
    load: () => host[key]
  };
}

/** Load a JSON object from an HTTP endpoint through an injectable fetch seam. */
export function fetchConfigSource(
  input: RequestInfo | URL,
  options: FetchConfigSourceOptions = {}
): ConfigSource {
  return {
    name: options.name ?? `fetch:${String(input)}`,
    async load() {
      const fetchImpl = options.fetch ?? globalThis.fetch;
      if (!fetchImpl) throw new Error('fetch is unavailable; inject options.fetch');
      const response = await fetchImpl(input, options.init);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
      }
      return response.json();
    }
  };
}

/**
 * Read top-level fields from URL query parameters. Each value is JSON-decoded
 * when possible (`true`, `42`, `null`, arrays, objects); other text stays a
 * string. Repeated keys become arrays in query order.
 */
export function urlConfigSource(options: UrlConfigSourceOptions = {}): ConfigSource {
  return {
    name: options.name ?? 'url',
    load() {
      const configured = typeof options.search === 'function' ? options.search() : options.search;
      const search =
        configured ??
        // wheel-raw-location: config READS the query string as boot input and
        // never navigates. wheel/config is a leaf that must not depend on the
        // router; callers wanting determinism inject `options.search`.
        (typeof location === 'undefined' ? '' : location.search);
      const params =
        search instanceof URLSearchParams
          ? search
          : new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
      const prefix = options.prefix ?? '';
      const result: Record<string, ConfigJson> = {};
      for (const [rawKey, rawValue] of params) {
        if (prefix && !rawKey.startsWith(prefix)) continue;
        const key = prefix ? rawKey.slice(prefix.length) : rawKey;
        if (!key) continue;
        const value = decodeUrlValue(rawValue);
        const existing = result[key];
        result[key] =
          existing === undefined
            ? value
            : Array.isArray(existing)
              ? [...existing, value]
              : [existing, value];
      }
      return result;
    }
  };
}

/** Zod itself, re-exported so a config contract needs one public import. */
export { z };

function parseConfig<Schema extends z.ZodType>(
  schema: Schema,
  value: unknown
): z.output<Schema> {
  const parsed: z.output<Schema> = schema.parse(value);
  assertJson(parsed, 'configuration schema output');
  return parsed;
}

function decodeUrlValue(value: string): ConfigJson {
  try {
    const parsed: unknown = JSON.parse(value);
    assertJson(parsed, 'URL configuration value');
    return parsed;
  } catch {
    return value;
  }
}

function assertJson(value: unknown, boundary: string): asserts value is ConfigJson {
  visitJson(value, boundary, new WeakSet<object>());
}

function visitJson(value: unknown, path: string, seen: WeakSet<object>): void {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${path} contains a non-finite number`);
    return;
  }
  if (typeof value !== 'object') {
    throw new TypeError(`${path} contains non-JSON ${typeof value}`);
  }
  if (seen.has(value)) throw new TypeError(`${path} contains a cycle`);
  seen.add(value);
  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) {
      if (!(index in value)) throw new TypeError(`${path}[${index}] is a sparse array slot`);
      visitJson(entry, `${path}[${index}]`, seen);
    }
    seen.delete(value);
    return;
  }
  if (!isPlainObject(value)) {
    throw new TypeError(`${path} contains a non-plain object`);
  }
  for (const [key, entry] of Object.entries(value)) {
    visitJson(entry, `${path}.${key}`, seen);
  }
  seen.delete(value);
}

function isPlainObject(value: unknown): value is Record<string, ConfigJson> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
