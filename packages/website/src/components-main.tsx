import { render } from 'solid-js/web';
import { ServiceProvider, viewRoot } from 'wheel/core';
import { WheelAnnotate } from 'wheel/annotate';

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
 * The component gallery is plain Solid, not a wheel app — so the annotator needs a
 * provider to hang off. `ServiceProvider` is clientless and holds no services
 * here; it exists to give the annotator a registry and a clock. Notes on this
 * page anchor to ELEMENTS (a DOM path plus a quote of the text), which is what
 * prose has instead of components.
 */
render(
  () => (
    <ServiceProvider scopeId="componentsapp">
      <ComponentsApp />
      <WheelAnnotate />
    </ServiceProvider>
  ),
  document.getElementById('root')!
);
