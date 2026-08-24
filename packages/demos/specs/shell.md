# Shell — behavior spec

The app AROUND the demos: the home page, the sticky sidebar, the shared
two-row demo header (title + latency selector + sync badge), the sync toasts,
the debug panel, and the two whole-tree fallbacks (not-found, route error).

Everything here is host-neutral by design, so every row runs against both
topologies: the standalone app at `/` (vite preview + the bun sync server) and
the embedded app at `/demos/*` (static embed, in-browser sync worker).

Ids are permanent: never renumber, never reuse; retire a row with
~~strikethrough~~, keep it in place.

| id | behavior | notes |
|---|---|---|
| SHELL-01 | The home page renders with the demo navigation | smoke |
| SHELL-02 | Sidebar navigation renders real hrefs and routes between demos | hrefs are externalized through the history seam, so under the embedded base prefix they carry `/demos` — a modified click or copied link stays inside the app |
| SHELL-03 | A cold load of a deep URL survives the SPA fallback | the host must serve `index.html` for every unmatched path; the whole layout chain re-renders from the URL alone |
| SHELL-04 | The sidebar lists every demo, and the brand link returns to the home page | brand + six demo links |
| SHELL-05 | The active sidebar link carries `aria-current="page"` and the active class | one lit link at a time; CSS and assistive tech read the same state |
| SHELL-06 | The home page shows one card per demo, each a real link, and a card click routes into it | six cards, `home-card-<demo>` |
| SHELL-07 | Moving between demos never reloads the document — the shell stays mounted | asserts zero further `load` events after the first paint |
| SHELL-08 | Every sync demo renders the shared header: the demo title, the latency selector, and the sync badge | `ConnectionPanel` row 1; the toolbar row is each demo's own |
| SHELL-09 | The sync badge reaches `connected` on a sync demo page | same badge over two different transports (WebSocket standalone, worker embedded) |
| SHELL-10 | The latency selector offers none / 100ms / 500ms / 2000ms and keeps the chosen value | values are the raw ms: `0`, `100`, `500`, `2000` |
| SHELL-11 | The latency choice is per tab and carries across a route change | one module-level ref behind a per-demo `LatencyService`; a full reload resets it to none |
| SHELL-12 | Under simulated latency a mutation shows the badge's in-flight chip, which clears once the server confirms | testids `sync-badge` / `inflight-chip`; the settled "✓ synced" hold is 600ms — too short to assert without flake |
| SHELL-13 | The same mutation raises the sync toast: "Saving 1 change…" then "✓ Saved" | headless `SyncActivity` → `ToastService`; stack testid `wheel-toast-stack` |
| SHELL-14 | Leaving a sync demo and coming back finds its client already connected | one cached `SyncClient` per demo, so a route change does not re-handshake |
| SHELL-15 | The debug panel opens from its toggle and lists the state tree, components, tables, and the change stream | `wheel-debug-toggle` / `wheel-debug-panel`, mounted by each sync demo |
| SHELL-16 | The debug panel's open state survives a fresh page load | localStorage key `wheel.debug-panel.open` |
| SHELL-17 | An unmatched URL renders the not-found page in place of the WHOLE tree — sidebar included — and its link returns home | the 404 replaces the root layout; it is not a page inside it |
| SHELL-18 | A route that throws renders the shell's error page while the sidebar stays alive, and "Back to demos" leaves it behind | node-scope containment: one dead page, intact chrome |
| SHELL-19 | In-browser sync mode (`?sync=local`) boots a sync demo with no sync server | also covered standalone by `browser/in-browser-sync.spec.ts` |
| SHELL-20 | Two tabs of the same demo stay in sync: a todo added in one tab appears in the other | standalone: WebSocket fan-out from the Bun server; embedded: one SharedWorker engine per origin serves every tab |
| SHELL-21 | The `window.__wheel` bridge drives the app: find a component, read its live state, invoke its action, and the UI updates | the agent door — `wheelDriver(page)` from `wheel/testing`; settle() waits for sync quiet |
| SHELL-22 | A console.error in the app lands in the capture buffer with a stable id, is listed in the debug panel's errors section, and reaches the driver as a thrown `WheelAppError` | 017 error capture: no raw text copy/pasting — errors are referenced by id |
| SHELL-23 | Annotation mode arms from its chip, the picker attaches a note to the component under the cursor, and the composer holds that component's live state | 021 annotate: `wheel-annotate-chip` / `-shield` / `-composer`; the draft (anchor + captured state) is readable through `__wheel.state()`. Writing to `.wheel/notes/` needs the dev-server endpoint, which the static embedded host does not serve — that half is covered by the plugin and service unit tests |
