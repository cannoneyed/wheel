# Project layout

Human page: [Project layout](../docs/project-layout.mdx).

The repository keeps application modules under `src/` and runtime entry points at the package or repository root.

## Directory contract

```text
app/
  index.html
  package.json
  tsconfig.json
  vite.config.ts
  sync-version.ts
  cloudflare/
    worker.ts    Worker router and Durable Object
  wrangler.jsonc
  server.ts      optional local or self-hosted Bun entry
  server/        schema, auth, config, migration helpers
  jobs/         external writers
  seed/         deterministic seed data
  test/         World integration tests
  browser/      Playwright behaviors
  src/
    main.tsx
    routes.tsx
    styles/tokens.css
    sync/        <domain>.sync.ts and <domain>.server.ts
    services/
    components/
    utils/
```

Browser-safe sync declarations and server bindings can share `src/sync`. Browser entries import only `*.sync.ts`; server runtimes import the matching `*.server.ts`. Build graphs and constraints keep server bindings out of the main client bundle.

## Compiler contract

```json
{
  "compilerOptions": {
    "moduleResolution": "Bundler",
    "verbatimModuleSyntax": true,
    "jsx": "preserve",
    "jsxImportSource": "solid-js"
  }
}
```

`verbatimModuleSyntax` preserves Solid directive imports. `moduleResolution: "Bundler"` resolves package subpaths.

## Naming contract

- Files use kebab-case.
- Components and service classes use PascalCase.
- Connected component files declare one `connect<Name>` function.
- Sync pairs share one plural domain stem.
- Component CSS modules share the component filename.

## CSS contract

- Import one global token stylesheet from `main.tsx`.
- Put component rules in sibling CSS modules.
- Import `wheel/styles` for framework tokens.
- Import `wheel/components/styles` for default component recipes.
- Use custom properties instead of literal theme colors.

## Identity contract

- Cache scope: stable in `localStorage`.
- Wire client id: memory only, new per page load.
- Actor: comes from the server's verified principal. `sessionStorage` is acceptable only for a demo user switcher.

## Root mounts

Mount `WheelApp` once. Mount each used kit system once beside the application shell. Mount one generated router root.

## Enforcement sources

- [`tsconfig.base.json`](../../tsconfig.base.json)
- [`eslint.config.mjs`](../../eslint.config.mjs)
- [`packages/wheel/eslint`](../../packages/wheel/eslint)
- [`packages/docs/src/source-contract.test.ts`](../../packages/docs/src/source-contract.test.ts)
