/**
 * Renders every docs page into a real DOM (jsdom). This is the regression net
 * for the whole MDX → Solid pipeline: string-component defaults, diagram
 * layout, and the live kernel demos all execute here. A page that throws — or
 * renders empty — fails.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'solid-js/web';
import { MDX_COMPONENTS } from './mdx-components';
import { NAV, PAGES } from './pages';
import Components from '../../../content/docs/components.mdx';
import Linting from '../../../content/docs/linting.mdx';
import LiveState from '../../../content/docs/live-state.mdx';
import Overview from '../../../content/docs/overview.mdx';
import State from '../../../content/docs/state.mdx';

describe('docs pages render', () => {
  for (const { slug: name, component: Page } of PAGES) {
    it(`renders ${name} with a heading and content`, () => {
      const host = document.createElement('div');
      document.body.appendChild(host);
      const dispose = render(() => <Page components={MDX_COMPONENTS} />, host);
      try {
        const h1 = host.querySelector('h1');
        expect(h1, `${name} should render its <h1>`).toBeTruthy();
        expect(host.textContent!.length).toBeGreaterThan(200);
      } finally {
        dispose();
        host.remove();
      }
    });
  }

  it('renders pipe tables as real tables (remark-gfm)', () => {
    for (const Page of [LiveState, State, Linting]) {
      const host = document.createElement('div');
      document.body.appendChild(host);
      const dispose = render(() => <Page components={MDX_COMPONENTS} />, host);
      try {
        const table = host.querySelector('table');
        expect(table, 'pipe-syntax markdown should produce a <table>').toBeTruthy();
        expect(table!.querySelectorAll('th').length).toBeGreaterThan(1);
        expect(table!.querySelectorAll('td').length).toBeGreaterThan(2);
        // If gfm were missing, the raw pipes would sit in a paragraph instead.
        expect(host.textContent).not.toContain('| --- |');
      } finally {
        dispose();
        host.remove();
      }
    }
  });

  it('highlights code blocks at build time (shiki spans present)', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const dispose = render(() => <LiveState components={MDX_COMPONENTS} />, host);
    try {
      const block = host.querySelector('pre.shiki');
      expect(block, 'fenced code should render as a shiki block').toBeTruthy();
      expect(block!.querySelectorAll('span[style]').length).toBeGreaterThan(10);
    } finally {
      dispose();
      host.remove();
    }
  });

  it('highlights CodeExample blocks at build time too (?example, not ?raw)', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const dispose = render(() => <Components components={MDX_COMPONENTS} />, host);
    try {
      const example = host.querySelector('.source-example');
      expect(example, 'CodeExample should render an example block').toBeTruthy();
      const block = example!.querySelector('pre.shiki');
      expect(block, 'the example should be shiki HTML from the ?example loader').toBeTruthy();
      expect(block!.querySelectorAll('span[style]').length).toBeGreaterThan(10);
      // Region markers are build metadata; they never reach the page.
      expect(example!.textContent).not.toContain('#region');
    } finally {
      dispose();
      host.remove();
    }
  });

  // pages.ts throws at import time when nav.ts and docs/ disagree, so merely
  // importing PAGES above is already the guard. This states the contract.
  it('the sidebar groups cover every page exactly once', () => {
    const grouped = NAV.flatMap((group) => group.pages.map((page) => page.slug));
    expect(new Set(grouped).size, 'a slug is in two groups').toBe(grouped.length);
    expect([...grouped].sort()).toEqual([...PAGES.map((page) => page.slug)].sort());
  });

  it('renders every diagram as laid-out SVG', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const dispose = render(() => <Overview components={MDX_COMPONENTS} />, host);
    try {
      const svg = host.querySelector('.diagram svg');
      expect(svg).toBeTruthy();
      expect(svg!.querySelectorAll('rect').length).toBeGreaterThan(3);
      expect(svg!.querySelectorAll('path').length).toBeGreaterThan(3);
    } finally {
      dispose();
      host.remove();
    }
  });

  it('the live counter demo is interactive (real kernel)', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const dispose = render(() => <Components components={MDX_COMPONENTS} />, host);
    try {
      const demo = host.querySelector('.demo')!;
      const plusOne = [...demo.querySelectorAll('button')].find((b) => b.textContent === '+1')!;
      expect(demo.textContent).toContain('count is 0');
      plusOne.click();
      expect(demo.textContent).toContain('count is 1');
      expect(demo.textContent).toContain('doubled is 2');
    } finally {
      dispose();
      host.remove();
    }
  });

  it('every internal page link targets a registered page', () => {
    const slugs = new Set(PAGES.map((page) => page.slug));
    for (const { slug, component: Page } of PAGES) {
      const host = document.createElement('div');
      document.body.appendChild(host);
      const dispose = render(
        () => <Page components={MDX_COMPONENTS} />,
        host
      );
      try {
        for (const link of host.querySelectorAll<HTMLAnchorElement>(
          'a[href^="#/"]'
        )) {
          const target = link.getAttribute('href')!.slice(2);
          expect(
            slugs.has(target as (typeof PAGES)[number]['slug']),
            `${slug} links to unregistered page ${target}`
          ).toBe(true);
        }
      } finally {
        dispose();
        host.remove();
      }
    }
  });
});
