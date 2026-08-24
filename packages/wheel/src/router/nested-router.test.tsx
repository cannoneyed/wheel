// @vitest-environment jsdom
/**
 * Two routers, one page: the outer one owns the address bar, the inner one runs
 * a wizard on its own in-memory history.
 *
 * This is the escape hatch for "I want a separate router for this pane". It
 * needs no router feature at all — only the ordinary service scoping rules:
 *
 *   <ServiceProvider inheritServices={false} overrides={[memoryHistoryOverride([...])]}>
 *
 * `inheritServices={false}` gives that subtree its own singletons, so the inner
 * router resolves its own `RouterHistoryService` — the overridden, in-memory one
 * — instead of the browser history its parent uses. Two independent URL atoms,
 * no coordination, no shared state.
 */
import type { JSX } from 'solid-js';
import { render } from 'solid-js/web';
import { beforeAll, describe, expect, it } from 'vitest';

import { ServiceProvider } from '../core/index';
import { createRouter } from './create-router';
import { Outlet } from './outlet';
import { memoryHistoryOverride } from './router-service';

function AppShell(): JSX.Element {
  return (
    <div data-testid="app-shell">
      <outerRouter.Link to="home" data-testid="outer-home">
        Home
      </outerRouter.Link>
      <outerRouter.Link to="checkout" data-testid="outer-checkout">
        Checkout
      </outerRouter.Link>
      <Outlet />
    </div>
  );
}

function HomePage(): JSX.Element {
  return <div data-testid="outer-home-page">home</div>;
}

/** The page that hosts a router of its own. */
function CheckoutPage(): JSX.Element {
  return (
    <div data-testid="checkout">
      <ServiceProvider
        scopeId="wizard"
        inheritServices={false}
        overrides={[memoryHistoryOverride(['/address'])]}
      >
        <wizardRouter.Root />
      </ServiceProvider>
    </div>
  );
}

function AddressStep(): JSX.Element {
  return (
    <div data-testid="step-address">
      <wizardRouter.Link to="payment" data-testid="wizard-next">
        Next
      </wizardRouter.Link>
    </div>
  );
}

function PaymentStep(): JSX.Element {
  return <div data-testid="step-payment">payment</div>;
}

const outerRouter = createRouter(
  {
    path: '/',
    component: AppShell,
    children: {
      home: { path: '/', component: HomePage },
      checkout: { path: 'checkout', component: CheckoutPage }
    }
  } as const,
  { name: 'OuterRouter' }
);

const wizardRouter = createRouter(
  {
    path: '/',
    children: {
      address: { path: 'address', component: AddressStep },
      payment: { path: 'payment', component: PaymentStep }
    }
  } as const,
  { name: 'WizardRouter' }
);

function mount(entries: string[]) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const dispose = render(
    () => (
      <ServiceProvider scopeId="outer-app" overrides={[memoryHistoryOverride(entries)]}>
        <outerRouter.Root />
      </ServiceProvider>
    ),
    host
  );
  return { host, teardown: () => (dispose(), host.remove()) };
}

beforeAll(() => {
  document.addEventListener('click', (event) => event.preventDefault());
});

function click(element: Element): void {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

describe('a nested router with its own history', () => {
  it('renders its own entry inside a page of the outer router', () => {
    const { host, teardown } = mount(['/checkout']);
    expect(host.querySelector('[data-testid=app-shell]')).not.toBeNull();
    expect(host.querySelector('[data-testid=step-address]')).not.toBeNull();
    teardown();
  });

  it('advances without touching the outer router', () => {
    const { host, teardown } = mount(['/checkout']);
    const outerHref = (host.querySelector('[data-testid=outer-checkout]') as HTMLAnchorElement)
      .getAttribute('href');

    click(host.querySelector('[data-testid=wizard-next]')!);

    expect(host.querySelector('[data-testid=step-payment]')).not.toBeNull();
    expect(host.querySelector('[data-testid=step-address]')).toBeNull();
    // The outer route is untouched: its page is still mounted around the wizard.
    expect(host.querySelector('[data-testid=checkout]')).not.toBeNull();
    expect(
      (host.querySelector('[data-testid=outer-checkout]') as HTMLAnchorElement).getAttribute('href')
    ).toBe(outerHref);
    teardown();
  });

  it('is torn down and restarted when the outer route leaves and returns', () => {
    const { host, teardown } = mount(['/checkout']);
    click(host.querySelector('[data-testid=wizard-next]')!);
    expect(host.querySelector('[data-testid=step-payment]')).not.toBeNull();

    click(host.querySelector('[data-testid=outer-home]')!);
    expect(host.querySelector('[data-testid=checkout]')).toBeNull();

    click(host.querySelector('[data-testid=outer-checkout]')!);
    // A fresh scope means a fresh memory history: the wizard starts over.
    expect(host.querySelector('[data-testid=step-address]')).not.toBeNull();
    teardown();
  });
});
