# wheel.dev — site plan

## Page map

| Path | Serves | Status |
|---|---|---|
| `/` | this package (landing) | built |
| `/docs/` | `content/docs/*.mdx` via the shared MDX pipeline, website chrome | built (`docs/index.html` MPA entry) |
| `/demos/*` | the demos embed (`bun run demos:embed`: base=/demos/, in-browser sync) | built — dev middleware + dist copy via `demos-embed-plugin.ts` |
| live sync demo slot (on `/`) | inline demo in section 03 | reserved `div.demo-slot` |

The Cloudflare website Worker now falls back unmatched `/demos/*` paths to
`/demos/index.html`. Dev middleware and the Playwright suite model the same behavior.

## The sync engine story (decided + partly built)

**In-browser mode is implemented** — see
`packages/demos/src/shared/in-browser/README.md`. The full wheel sync server
(all four demo engines) runs on WASM SQLite in a Web Worker; the client talks
to it over a postMessage transport instead of a WebSocket. Demos run as pure
static files: `?sync=local` at dev time, `VITE_SYNC_MODE=browser` for the
static deploy.

Cloudflare branch deployment now serves the landing page, docs, and browser-local demos as
Worker static assets. Wheel also has a Durable Object backend for the separate Axle tracker.

Shared website demo rooms remain future work. They need one Durable Object per room,
alarm-based expiry, and per-visitor room ids. They are not required for the static demos.

## Iteration backlog

1. Build the section-03 inline sync demo (two panes + latency/offline toggle)
   on the same worker engine.
2. Copy pass on the landing narrative (current copy is a strong draft, not final).
3. Launch chrome: OG image, favicon, analytics, real GitHub URL in `LINKS`.
