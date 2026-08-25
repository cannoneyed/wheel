# 🥝 wheel

Wheel is the batteries-included framework for building apps on Durable Objects with agents.

> **Alpha software:** Wheel is in active v0 development. APIs and stored data formats can change between releases. Pin an exact version and test upgrades before deployment.

```
bun add wheel@npm:@cannoneyed/wheel@0.1.0 solid-js
```

`wheel` is the local npm alias. Keep imports such as `wheel/core` unchanged.

- **modularity** - every component declares its data needs for easy composition and testing
- **transparency** - every piece of state is named, tracked, and inspectable at runtime
- **debuggability** - inspect connected components, service state, actions, and sync activity in the debug panel

## What

Wheel is batteries-included and very opinionated. That's ok! It stands on the shoulders of giants

- **Solid** rendering engine for amazing performance and DX.
- **Local-first sync engine.** optimized for Durable Objects, backed by SQLite.
- **Global singleton services** that own all shared state and force unidirectional data flow through named actions.
- **Observable signals** that make all state queryable, traceable, and debuggable.
- **Strict conventions** that tie components to global state for debuggability, traceability, testability, and maintainability.
- **lint rules + constraint tests** that turn the conventions into build failures, so the rules hold as the app grows.
- **batteries-included modules** for some of the most common application features, including routing, keyboard shortcuts and focus management, undo/redo, command palettes, context menus, dialogs, and configuration.
- **a component library** built from the Solid port of Base UI primitives with Mira recipes.

## Why

Alan Kay coined the term "object-oriented" and then spent thirty years saying nobody understood him.

▎ "I thought of objects being like ... individual computers on a network"

His objects were supposed to be whole computers. Isolated, addressable, talking only by message. He called it _recursion on the notion of computer itself_ — computers all the way down.

This idea needed a computer per object, but it was never really practical - until now.

[Durable Objects](https://www.cloudflare.com/products/durable-objects/) make **computers** cheap and agents make **software** cheap.

I like to think of this new class of applications as **agentic objects**: a document, a spreadsheet, a canvas, or a single widget, each running on its own Durable Object with its own state.

Wheel is the toolkit for building these **agentic objects**. It's an opinionated framework for the agentic era - a world where every widget is a website.


## Quickstart

Follow [Getting Started](./content/docs/getting-started.mdx).

```
bun run docs            # the documentation site
bun run demos           # demos browser; add ?sync=local for the in-browser engine
bun run demos:server    # WebSocket sync for the normal demos mode
bun run tracker         # tracker browser (Linear clone for stress testing)
bun run tracker:server  # local Tracker WebSocket server
bun run check           # lint, types, tests, docs build, backends, packed consumers
bun run lint            # the convention linter — zero errors is the only passing state
```

Tracker is a stress test, not a production template. Its branch preview runs on a Worker and Durable Object. The [production roadmap](packages/tracker/ROADMAP.md) separates shipped runtime proof from identity, workspace, backup, restore, and rollout work.

## Repository layout

```
packages/wheel       the framework package and eslint rules
packages/docs        the documentation site (MDX → Solid)
packages/tracker     Axle, a Linear clone — the reference app (see TOUR.md)
packages/demos       todos, kanban, editor, sheet, graph, sequencer, framing, routing, shell
packages/playground  any component at three sandbox tiers
```

| Subpath | Holds |
| --- | --- |
| `wheel/auth` | Provider-neutral authentication contracts |
| `wheel/config` | Zod + JSON bootstrap, fetch, and URL configuration |
| `wheel/core` | `Service`, `atom`, `computed`, `computedFor`, `connect`, `view`, providers |
| `wheel/sync` | declarations (`table`/`query`/`mutation`/`presence`), `SyncClient`, `SyncService`, `liveQuery`, transports, local cache |
| `wheel/sync/server` | `createSyncServer`, `serveQuery`/`serveMutation`, WebSocket sessions, and SQLite backends |
| `wheel/sync/server/cloudflare` | Worker-safe engine exports, Durable Object backend, and migration runner |
| `wheel/sync/server/testing` | Runtime-neutral backend conformance contract |
| `wheel/components` | 38 aggregate and deep component-family entries, plus `wheel/components/styles` |
| `wheel/kit` | Framing/LayoutService, Keyboard, Focus, Dialog, Command Palette, Context Menu, Toasts |
| `wheel/router` | Path routing where the URL is an atom: nested routes, typed params and search, URL-backed atoms |
| `wheel/debug` | the debug panel + on-screen inspector |
| `wheel/testing` | the `World` harness and `simulate` chaos schedules |

The Wheel state layers form a strict DAG. `core` is the bottom. `components` is independent. `sync` builds on `core`; `kit` builds on `core` and `components`; `sync/server` builds on `sync`; `debug` and `testing` read downward. Auth and config stay independent. Router builds on `core` only. `no-cross-layer-imports` enforces every internal edge.
