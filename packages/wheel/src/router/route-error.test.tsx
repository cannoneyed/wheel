// @vitest-environment jsdom
import type { JSX } from 'solid-js';
import { render } from 'solid-js/web';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { Service, ServiceProvider, componentRoot, connect, view } from '../core/index';
import { createRouter } from './create-router';
import { Outlet } from './outlet';
import { memoryHistoryOverride } from './router-service';
import type { RouteErrorInfo } from './route-error';

/** Flipped per test to break a specific node in the chain. */
let shellThrows = false;
let leafThrows = false;
let notFoundThrows = false;

function Shell(): JSX.Element {
  if (shellThrows) throw new Error('shell exploded');
  return (
    <div data-testid="shell">
      <appRouter.Link to="safe" data-testid="to-safe">
        Safe
      </appRouter.Link>
      <appRouter.Link to="broken" data-testid="to-broken">
        Broken
      </appRouter.Link>
      <Outlet />
    </div>
  );
}

function SafePage(): JSX.Element {
  return <div data-testid="safe">safe</div>;
}

function BrokenPage(): JSX.Element {
  if (leafThrows) throw new Error('page exploded');
  return <div data-testid="recovered">recovered</div>;
}

/**
 * The kanban-crash shape: a service whose eagerly-evaluated computed throws
 * while the service is being constructed, i.e. inside the page's `connect`.
 */
class ExplodingService extends Service {
  /** Identity that survives minification (see require-service-name). */
  static override serviceName = 'ExplodingService';

  readonly value = this.computed((): number => {
    throw new Error('service exploded');
  }, 'value');
}

const connectServicePage = connect('ServicePage', (c) => {
  const exploding = c.service(ExplodingService);
  return view({ value: exploding.value });
});

function ServicePage(): JSX.Element {
  const state = connectServicePage({});
  return <div use:componentRoot data-testid="service-page">{state.value}</div>;
}

const routes = {
  path: '/',
  component: Shell,
  children: {
    safe: { path: '/', component: SafePage },
    broken: { path: 'broken', component: BrokenPage },
    service: { path: 'service', component: ServicePage }
  }
} as const;

const reported: Array<{ message: string; info: RouteErrorInfo }> = [];

function NotFound(): JSX.Element {
  if (notFoundThrows) throw new Error('not-found exploded');
  return <div data-testid="missing">404</div>;
}

const appRouter = createRouter(routes, {
  name: 'ErrorRouter',
  notFound: NotFound,
  onError: (error, info) => {
    reported.push({ message: error instanceof Error ? error.message : String(error), info });
  }
});

function mount(entries: string[]) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const dispose = render(
    () => (
      <ServiceProvider scopeId="error-app" overrides={[memoryHistoryOverride(entries)]}>
        <appRouter.Root />
        {/* Navigation that lives OUTSIDE the routed tree, so it survives even a
            global failure. Every app should have one somewhere. */}
        <appRouter.Link to="broken" data-testid="escape">
          Escape
        </appRouter.Link>
      </ServiceProvider>
    ),
    host
  );
  return {
    host,
    teardown: () => {
      dispose();
      host.remove();
    }
  };
}

// Real <a href> clicks: record whether the router claimed the default, then
// stop it so jsdom does not attempt a navigation it cannot perform.
beforeAll(() => {
  document.addEventListener('click', (event) => event.preventDefault());
});

function click(element: Element): void {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

beforeEach(() => {
  shellThrows = false;
  leafThrows = false;
  notFoundThrows = false;
  reported.length = 0;
  // The boundary logs every error on purpose; keep the suite output readable.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a failing page cannot break routing', () => {
  it('contains a broken leaf, leaving the shell and its links alive', () => {
    leafThrows = true;
    const { host, teardown } = mount(['/broken']);

    expect(host.querySelector('[data-wheel-router=error]')).not.toBeNull();
    // The whole point: navigation survived the crash.
    expect(host.querySelector('[data-testid=shell]')).not.toBeNull();
    expect(host.querySelector('[data-testid=to-safe]')).not.toBeNull();
    teardown();
  });

  it('recovers on navigation — the fallback does not outlive the bad route', () => {
    leafThrows = true;
    const { host, teardown } = mount(['/broken']);
    expect(host.querySelector('[data-wheel-router=error]')).not.toBeNull();

    click(host.querySelector('[data-testid=to-safe]')!);

    expect(host.querySelector('[data-wheel-router=error]')).toBeNull();
    expect(host.querySelector('[data-testid=safe]')).not.toBeNull();
    teardown();
  });

  it('contains a service that throws while constructing', () => {
    const { host, teardown } = mount(['/service']);
    expect(host.querySelector('[data-wheel-router=error]')).not.toBeNull();
    expect(host.querySelector('[data-testid=shell]')).not.toBeNull();
    expect(reported.map((entry) => entry.message)).toContain('service exploded');
    teardown();
  });

  it('reports every error with its URL and scope', () => {
    leafThrows = true;
    const { teardown } = mount(['/broken']);
    expect(reported).toHaveLength(1);
    expect(reported[0].message).toBe('page exploded');
    expect(reported[0].info).toEqual({ url: '/broken', scope: 'node', depth: 1 });
    teardown();
  });

  it('catches globally when the not-found view itself throws', () => {
    notFoundThrows = true;
    const { host, teardown } = mount(['/no-such-page']);

    const fallback = host.querySelector('[data-wheel-router=error]');
    expect(fallback?.getAttribute('data-wheel-router-scope')).toBe('global');
    expect(reported[0].info).toEqual({ url: '/no-such-page', scope: 'global', depth: null });
    teardown();
  });
});

describe('a failing shell cannot break routing either', () => {
  it('falls back rather than rendering a blank document, and says the app is down', () => {
    shellThrows = true;
    const { host, teardown } = mount(['/']);

    expect(host.querySelector('[data-wheel-router=error]')).not.toBeNull();
    // The root layout IS the app, so depth 0 is how a reporter tells "one page
    // broke" from "the user is staring at a fallback where the app used to be".
    expect(reported[0].info.depth).toBe(0);
    teardown();
  });

  it('keeps the router service alive, so navigating re-renders the app', () => {
    shellThrows = true;
    const { host, teardown } = mount(['/']);
    expect(host.querySelector('[data-wheel-router=error]')).not.toBeNull();

    // The URL atom and its history listener live OUTSIDE the render that
    // failed — `[data-testid=escape]` is a link mounted beside the router root,
    // exactly where an app-level error page or chrome would live. Clicking it
    // resets the boundary and the app comes back.
    shellThrows = false;
    click(host.querySelector('[data-testid=escape]')!);

    expect(host.querySelector('[data-wheel-router=error]')).toBeNull();
    expect(host.querySelector('[data-testid=shell]')).not.toBeNull();
    expect(host.querySelector('[data-testid=recovered]')).not.toBeNull();
    teardown();
  });
});
