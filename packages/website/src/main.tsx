/**
 * wheel.dev landing page: chrome only.
 *
 * Every word of the page — headline, section labels, prose, list rows, button
 * labels — lives in `content/website/home.mdx`, beside the docs pages rather
 * than buried in this package. This file is the shared site chrome and
 * the one call that renders that document through the shared docs MDX pipeline
 * (same `MDX_COMPONENTS` map the /docs pages use, so markdown inside the
 * landing scroll styles identically).
 */
import { render } from 'solid-js/web';
import { } from 'wheel/core';
import { WheelAnnotate } from 'wheel/annotate';
import { WheelApp } from 'wheel/debug';
import { annotationEnabled } from './annotation';

import './styles.css';
// The live figure renders real wheel components (the unplug switch), so the
// landing page needs the library's recipe sheet like any other consumer.
import 'wheel/components/styles';
import '../../docs/src/site/site-chrome.css';
import { MDX_COMPONENTS } from '../../docs/src/mdx-components';
import { SiteFooter, SiteHeader } from '../../docs/src/site/SiteHeader';
import Home from '../../../content/website/home.mdx';

function App() {
  // wheel-view-root: fragment with multiple top-level elements
  return (
    <>
      <SiteHeader />
      <main>
        <Home components={MDX_COMPONENTS} />
      </main>
      <SiteFooter />
    </>
  );
}

/**
 * A wheel app like every other page here.
 *
 * It held a bare `ServiceProvider` while the annotator carried its own chip.
 * The chip is gone — annotating is something you do to a wheel app, so the way
 * in is the app's own instrument dock, and a page that wants to be annotated
 * has to have one. `WheelApp` is clientless here: no data to sync, just the
 * shell the annotate pane lives in.
 */
render(
  () => (
    <WheelApp scopeId="app">
      <App />
      <WheelAnnotate enabled={annotationEnabled()} />
    </WheelApp>
  ),
  document.getElementById('root')!
);
