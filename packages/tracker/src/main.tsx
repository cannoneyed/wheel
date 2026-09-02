/** Axle entry: theme tokens, the client, the provider, the shell. */
import { render } from 'solid-js/web';
import { WheelApp } from 'wheel/debug';
import { WheelAnnotate } from 'wheel/annotate';

import './styles/tokens.css';
import { trackerClient } from './utils/tracker-client';
import { AppShell } from './components/shell/app-shell';

render(
  () => (
    <WheelApp client={trackerClient()}>
      <AppShell />
      {/* Axle is our own app, so annotation is on in every build — including
          the production preview the browser suite runs against. That is the
          production story working, not a dev convenience. */}
      <WheelAnnotate enabled />
    </WheelApp>
  ),
  document.getElementById('root')!
);
