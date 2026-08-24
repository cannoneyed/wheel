# Project layout

Human page: [Project layout](../docs/project-layout.mdx).

The repository uses package-root server and test files plus browser code under `src/`.

## Directory contract

```text
app/
  index.html
  package.json
  tsconfig.json
  vite.config.ts
  server.ts
  server/       schema, auth, config, request guards
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

Server-only code remains outside `src/`. Browser-safe sync declarations can live in `src/sync`; `*.server.ts` files are excluded from browser imports by convention and constraints.

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
- Actor selection: application-defined; `sessionStorage` is acceptable for per-tab demo identity.

## Root mounts

Mount `WheelApp` once. Mount each used kit system once beside the application shell. Mount one generated router root.

## Enforcement sources

- [`tsconfig.base.json`](../../tsconfig.base.json)
- [`eslint.config.mjs`](../../eslint.config.mjs)
- [`packages/wheel/eslint`](../../packages/wheel/eslint)
- [`packages/docs/src/source-contract.test.ts`](../../packages/docs/src/source-contract.test.ts)
