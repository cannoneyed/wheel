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

render(() => <App />, document.getElementById('root')!);
