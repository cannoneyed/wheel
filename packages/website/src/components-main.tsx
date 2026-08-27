import { render } from 'solid-js/web';
import { viewRoot } from 'wheel/core';
import { WheelApp } from 'wheel/debug';
import { WheelAnnotate } from 'wheel/annotate';
import { annotationEnabled } from './annotation';

import '../../docs/src/theme.css';
import 'wheel/components/styles';
import '../../docs/src/site/site-chrome.css';
import '../../playground/src/component-demos.css';
import '../../playground/src/component-audit.css';
import './components-chrome.css';
import { SiteHeader } from '../../docs/src/site/SiteHeader';
import { ComponentAudit } from '../../playground/src/component-audit';

/** Public component library: shared website chrome around the live family catalog. */
function ComponentsApp() {
  return (
    <div use:viewRoot={'ComponentsApp'} class="components-site">
      <SiteHeader active="components" />
      <ComponentAudit />
    </div>
  );
}

/**
 * The catalog is a wheel app like any other.
 *
 * It held a bare `ServiceProvider` for a while, on the theory that a gallery of
 * components is "plain Solid" — which made the one page dedicated to wheel
 * components the one page where wheel components could not be inspected. Every
 * library part now registers itself (see `renderElement`), so `WheelApp` gives
 * this page the same debug panel, the same component tree and the same
 * inspector as the tracker. It is clientless: there is no data here to sync.
 */
render(
  () => (
    <WheelApp scopeId="componentsapp">
      <ComponentsApp />
      <WheelAnnotate enabled={annotationEnabled()} />
    </WheelApp>
  ),
  document.getElementById('root')!
);
