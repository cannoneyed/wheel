/**
 * The demo app's index route — what `/` renders.
 *
 * The root of the tree is `AppShell`, a layout. `/` matches THIS child rather
 * than the layout, which is the rule that makes index routes work: the deepest
 * match that consumes every segment wins.
 */
import { For } from 'solid-js';
import { viewRoot } from 'wheel/core';

import { appRouter } from './routes';

/** One card. `to` is checked against the route table at compile time. */
interface DemoCard {
  readonly to:
    | 'todos'
    | 'kanban'
    | 'editor'
    | 'sheet'
    | 'graph'
    | 'sequencer'
    | 'routing.overview'
    | 'framing';
  readonly title: string;
  readonly blurb: string;
  readonly tag: string;
}

const CARDS: readonly DemoCard[] = [
  {
    to: 'todos',
    title: 'Todos',
    blurb: 'The smallest complete app: one live query, optimistic writes, undo.',
    tag: 'sync'
  },
  {
    to: 'kanban',
    title: 'Kanban',
    blurb: 'Drag between columns, multi-select, bulk delete behind a confirm dialog.',
    tag: 'sync'
  },
  {
    to: 'editor',
    title: 'Editor',
    blurb: 'Block document with a context menu and a full undo/redo history.',
    tag: 'sync'
  },
  {
    to: 'sheet',
    title: 'Spreadsheet',
    blurb: 'Keyboard-driven grid, formula cells, and a selection service.',
    tag: 'sync'
  },
  {
    to: 'graph',
    title: 'Graph',
    blurb: 'A force-directed graph on a three.js canvas: rows sync, positions do not.',
    tag: 'sync'
  },
  {
    to: 'sequencer',
    title: 'Sequencer',
    blurb: 'A WebAudio drum machine: the pattern syncs, the playhead stays local.',
    tag: 'sync'
  },
  {
    to: 'routing.overview',
    title: 'Routing',
    blurb: 'Nested layouts, typed path and search params, URL-backed atoms.',
    tag: 'router'
  },
  {
    to: 'framing',
    title: 'Framing',
    blurb: 'Resizable frames, command palette, dialogs, toasts, keyboard system.',
    tag: 'kit'
  }
];

/** Landing page: one card per demo. */
export function HomePage() {
  return (
    <div use:viewRoot={'HomePage'} class="home" data-testid="home-page">
      <h1>🥝 wheel demos</h1>
      <p class="home-lede">
        Six local-first apps on one sync engine, plus routing and application
        framing playgrounds.
      </p>
      <div class="home-note" data-testid="home-backend-note">
        <p>
          <strong>There is no server here.</strong> Every sync demo below talks to a real wheel
          sync engine running <em>in this tab</em> — the same engine code a deployed app runs,
          on SQLite compiled to WebAssembly, inside a worker. Nothing is mocked and nothing is
          faked: the demos speak the real protocol to a real database.
        </p>
        <p>
          Where the browser supports <code>SharedWorker</code>, all your tabs share one engine.
          Open a demo twice and the two tabs are two clients of one server — edits and presence
          cross between them exactly as they would over a network. The database lives only as
          long as the last tab, so a full reload starts from the seed.
        </p>
        <p>
          In production that engine is the same code, hosted differently: one{' '}
          {/* wheel-raw-anchor: external documentation link on a static info panel */}
          <a href="https://www.cloudflare.com/products/durable-objects/">Durable Object</a> per
          document, holding its own SQLite database. Swapping the worker for a Durable Object
          changes the transport and nothing else — which is why these pages can prove the real
          thing with no backend at all.
        </p>
      </div>
      <div class="home-cards">
        <For each={CARDS}>
          {(card) => (
            <appRouter.Link
              to={card.to}
              class="home-card"
              data-testid={`home-card-${card.to.split('.')[0]}`}
            >
              <span class="home-card-tag">{card.tag}</span>
              <span class="home-card-title">{card.title}</span>
              <span class="home-card-blurb">{card.blurb}</span>
            </appRouter.Link>
          )}
        </For>
      </div>
    </div>
  );
}
