# Routing — behavior spec

The routing playground at `/routing`: a demo layout with its own nav and
history buttons, a nested team layout with a `$teamId` param, an issue list
with a URL-backed text filter and a Zod-typed `status` search param, an issue
detail with a second param, a deliberately broken page, and a live panel that
prints the router's state. No sync backend — the data is two local atoms, so
there is nothing to reset and no in-flight state to wait on.

Ids are permanent: never renumber, never reuse; retire a row with
~~strikethrough~~, keep it in place.

Shell-level behavior (the home page, the sidebar between demos, the SPA
fallback for shell routes) lives under `SHELL-NN` and is specified elsewhere;
`packages/demos/browser/router.spec.ts` carries those ids where it covers them.

| id | behavior | notes |
|---|---|---|
| ROUTING-01 | `/routing` renders the demo layout — Overview/team/broken links, Back and Forward buttons, the router-state panel — with the overview index page inside it | smoke; the index child is what gives the layout's own path content |
| ROUTING-02 | The demo nav marks the active link with `aria-current="page"` and the active class, and moves the mark as you navigate | `<Link>` hrefs are externalized through the history seam, so they carry the deployment base and match the address bar on both hosts |
| ROUTING-03 | A click with a modifier held is left to the browser: the router does not intercept and this tab stays where it was | router.spec.ts only |
| ROUTING-04 | A cold load of a deep URL renders the whole chain — demo layout, team layout, issue list — with the path param bound and the state panel agreeing | also proves the host's SPA fallback (SHELL-03) |
| ROUTING-05 | The team layout reads its own `$teamId` through `matchOf('routing.team')` even though a child route is what matched | router.spec.ts only; params accumulate down the chain |
| ROUTING-06 | Switching teams keeps the demo layout and the team layout mounted — only the leaf below the outlet swaps | asserted through local DOM state (the filter box) surviving |
| ROUTING-07 | The issue detail route binds two params at once (`teamId` and `issueId`); its "All issues" link returns to the list | |
| ROUTING-08 | With two sibling routes that could match, the more specific one wins: `issues` vs `issues/$issueId` | router.spec.ts only; segment count decides |
| ROUTING-09 | A URL naming an issue that does not exist still matches the route; the page renders its own missing-data view, not the app's 404 | router.spec.ts only; "missing" is a data question |
| ROUTING-10 | A URL naming a team that does not exist renders the team layout's own missing-team view | |
| ROUTING-11 | The status buttons navigate with a typed `status` search param: the list narrows, the URL follows, the panel shows the parsed value | |
| ROUTING-12 | The schema's default (`status=all`) is left out of the URL — clearing the filter shortens the link instead of pinning the default | router.spec.ts only |
| ROUTING-13 | A hand-edited `status` value the schema rejects falls back to the default instead of crashing the page | router.spec.ts only; `?status=banana` → `all` |
| ROUTING-14 | A search param set on a `<Link>` survives the click, so a link can point at a filtered view | router.spec.ts only |
| ROUTING-15 | Search params carry across sibling routes that share the team layout — the Issues/Board tabs keep `?status=` | router.spec.ts only; the schema is declared once on the parent |
| ROUTING-16 | The board page splits the team's issues into Open and Done columns | not covered by a browser test beyond "the board renders" |
| ROUTING-17 | Typing in the filter box narrows the list and writes `?q=` into the address bar; the panel's `url` shows the same value | the panel prints the router's URL, base stripped — identical on both hosts |
| ROUTING-18 | A burst of keystrokes adds NO history entries: one Back leaves the list entirely instead of stepping through `f`, `fi`, `fil`… | router.spec.ts only; the filter writes with `replaceState` |
| ROUTING-19 | `?q=` is a shareable link — a cold load restores the filter box's value and the filtered result, including the empty state | router.spec.ts only |
| ROUTING-20 | An empty filter is left out of the URL | router.spec.ts only |
| ROUTING-21 | The text filter and the typed status filter compose into one URL and one filtered list | router.spec.ts only |
| ROUTING-22 | The layout's own Back and Forward buttons move through history entries | `router.back()` / `router.forward()` |
| ROUTING-23 | The browser's own Back and Forward restore the previous filter and re-light its button | uses `page.goBack()` / `page.goForward()` — uninstrumented navigation |
| ROUTING-24 | A reload keeps the exact view: the filter box's value and the filtered rows come back from the URL | router.spec.ts only |
| ROUTING-25 | A cold load of an unmatched URL under `/routing` renders the app's not-found page, and the demo is not mounted at all | router.spec.ts only |
| ROUTING-26 | The "Broken link" plain anchor does a real page load onto an unmatched URL and still lands on the not-found page | the href is base-aware (`import.meta.env.BASE_URL`), so the app's 404 answers on the embedded host, not the website's |
| ROUTING-27 | The broken page's failure is contained: the error fallback names the cause, and the sidebar, demo nav, and history buttons are all still on screen | |
| ROUTING-28 | Navigating away from the broken page recovers the app — the fallback is gone and the next page renders | |
| ROUTING-29 | A cold load straight onto the broken URL still offers a way out: the fallback's home link leaves it behind | router.spec.ts only |
| ROUTING-30 | The error fallback's Retry re-renders the same route; the crash page is deterministically broken, so the fallback comes back | |
| ROUTING-31 | The state panel tracks url, route name, chain, params, and search live, through an ordinary connect declaration | |
| ROUTING-32 | The issue detail renders the issue's title and status for an id that exists | router.spec.ts asserts the title only |
