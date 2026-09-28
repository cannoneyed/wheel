# Configuration

Human page: [Configuration](../docs/configuration.mdx). API: [`wheel/config`](api/config.md).

`defineConfig(schema)` creates one validated JSON configuration definition.

## Definition members

- `schema`: original Zod schema.
- `parse(value)`: validate one composed value.
- `load(sources)`: load, merge, and validate sources.
- `serialize(value)`: validate and JSON encode.
- `deserialize(text)`: JSON decode and validate.

## Source order

Sources run from least to most authoritative. A later top-level key replaces the earlier value. Objects and arrays replace as complete values; no deep merge occurs.

Zod defaults run after all sources merge.

## Shipped sources

- `valueConfigSource(name, value)`: fixed value for defaults and tests.
- `bootstrapConfigSource(options)`: host object key such as `__WHEEL_CONFIG__`.
- `fetchConfigSource(input, options)`: JSON HTTP response.
- `urlConfigSource(options)`: prefixed URL query fields.

Each browser dependency is injectable. Pass host, fetch, search text, or lazy search function for deterministic tests.

## URL values

Values JSON-decode when possible. Repeated keys become arrays in source order. Invalid JSON stays text. The default prefix keeps application config separate from router search state.

## JSON boundary

Every source value and final schema output must be plain JSON. Reject `undefined`, sparse arrays, non-finite numbers, bigint, `Date`, class instances, functions, symbols, and cycles. Errors name the source and value path.

## Security boundary

Client configuration is public. Keep secrets in server process environment. Server environment parsing is application code, not `wheel/config`.

## Wheel config (`src/wheel.config.ts`)

Wheel's own app-wide settings. Separate from `wheel/config` app configuration above.

- One file per app: `src/wheel.config.ts` default-exports `defineWheelConfig({...})` (from `wheel/core`). JSON only (throws on functions, non-finite numbers, class instances); returns a frozen copy.
- Enters ONCE at the root: `<WheelApp config>`, `<WheelProvider config>`, root `<ServiceProvider config>`, or `new ServiceContext({ config })` in tests. Child contexts inherit; a child given `config` throws.
- Read with `WheelConfigService.section(key, schema)`: Zod-parsed, defaults applied, cached; bad values throw `Invalid wheel config: <section>.<field>: …`.
- Packages declare sections by augmenting `interface WheelAppConfig` (in `core/app-config`).
- Global components take no behavior settings as props (`no-global-system-props`). Config is app-wide behavior; view render functions stay props (allowlisted: `ToastSystem renderToast`).

| Section | Fields (defaults) |
| --- | --- |
| `commandPalette` | `openKeyCommand`: string or string[] (`['mod+k', 'mod+shift+p']`) |
| `commands` | `blockedKeyFeedback`: `'toast'` \| `'none'` (`'toast'`) |
| `layout` | `storage`: `'local'` \| `'memory'` (`'local'`); `storagePrefix` (`'wheel.layout'`); `storageKey` (`'frames'`) |
| `debug` | `control`: `'built-in'` \| `'controlled'` (`'built-in'`) |
| `annotate` | `enabled` (dev mode); `sink`: `{ url, headers? }` (`/__wheel/note`) |

Primary sources: [`packages/wheel/src/config/index.ts`](../../packages/wheel/src/config/index.ts), [`packages/wheel/src/core/app-config.ts`](../../packages/wheel/src/core/app-config.ts).
