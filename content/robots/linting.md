# Linting

Human page: [Linting](../docs/linting.mdx). Plugin entry: `wheel/eslint`.

Run `bun run lint`. Repository CI accepts zero errors. Escapes are adjacent source pragmas with reasons, not config holes.

## Component rules

- `single-connect`: one named connection, called first.
- `single-connect-per-file`: one connection declaration per production file.
- `connect-only`: service access only through the connection callback.
- `no-whole-service-injection`: shapes contain values and actions, not service objects.
- `max-connect-surface`: at most 12 fields and 3 services.
- `no-called-view-read`: defer `view()` reads.
- `require-component-root`: connected host roots use `componentRoot`.
- `require-view-root`: non-connected host roots use `viewRoot`.
- `no-directive-on-component`: `use:` directives sit on native elements; Solid drops them on a component.
- `require-stable-instance-name`: entity props produce entity-derived instance ids.
- `require-component-states`: connected kit components provide typed states.
- `require-tracked-show`: root `Show` imports the Wheel wrapper.
- `require-use-signal`: component-local signals carry names.
- `require-connect-props`: forward component props to the connection.
- `require-view-props`: forward view props to the root directive.
- `require-effect-reason`: effects and mounts state their imperative boundary.
- `no-dev-mode-show`: module dev-mode booleans use plain conditionals.

## Service and sync rules

- `prefer-computed`: read-only derivations use computeds.
- `no-handles-in-atoms`: live runtime handles stay out of frozen state.
- `no-optional-computed-args`: keyed memo args do not include `undefined`.
- `no-early-field-read`: eager fields do not read later fields.
- `require-tracked-service-fields`: mutable private service state uses `field()`.
- `require-latest-async-task-wait`: latest-wins async boundaries use the token.
- `invert-return-type`: mutation inverses have explicit return types.
- `no-snake-case-mismatch-in-prune`: row-image reads use database spelling.
- `no-raw-sql-placeholders`: raw SQL does not use portable-fragment placeholder syntax.
- `no-teardown-booleans`: sync client teardown uses `AbortSignal`.

## Architecture and runtime rules

- `no-cross-layer-imports`: Wheel source imports only allowed lower layers.
- `no-raw-timers`: business code uses injected clocks, scheduling, and randomness.
- `no-raw-location`: navigation uses `RouterService`.
- `no-raw-anchor-navigation`: internal anchors use typed `Link`.
- `no-raw-console`: app logs use Wheel logger.
- `no-hardcoded-color`: application theme colors use tokens.
- `no-barrel-icon-imports`: icons use per-icon entries.
- `require-keep-names`: Wheel Vite consumers install `wheelDevTools()`.

## Package and proof rules

- `require-export-jsdoc`: library exports have source documentation.
- `require-member-jsdoc`: public members of exported classes have documentation.
- `no-unused-imports`: imported bindings must be referenced.
- `require-behavior-id`: demo Playwright behavior ids map to spec rows.

## Scope

The root [`eslint.config.mjs`](../../eslint.config.mjs) applies separate blocks to package files, demo browser specs, Wheel source, sync client source, Wheel TSX, application source, and tests. Application coverage is wildcard-minus-kernel, so new package source is included automatically.

The layer rule treats auth, config, core, and components as leaves. Router and sync can import core. Kit can import core and components. Server, debug, and testing can import their listed lower layers.

## Non-syntax checks

Constraint tests enforce browser-safe imports and other runtime boundaries. Parity helpers check optimistic/server equivalence and query invalidation.

## Current limits

Static rules do not infer arbitrary prop data flow, prove a wire id's storage origin, or detect every hidden side effect in a called helper.

Source catalog: [`packages/wheel/eslint/index.mjs`](../../packages/wheel/eslint/index.mjs). Each rule file starts with its failure story and examples.
