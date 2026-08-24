import { render } from 'solid-js/web';
import { viewRoot } from 'wheel/core';

import '../../docs/src/theme.css';
import 'wheel/components/styles';
import '../../docs/src/site/site-chrome.css';
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

render(() => <ComponentsApp />, document.getElementById('root')!);
