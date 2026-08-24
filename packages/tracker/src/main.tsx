/** Axle entry: theme tokens, the client, the provider, the shell. */
import { render } from 'solid-js/web';
import { WheelApp } from 'wheel/debug';

import './styles/tokens.css';
import { trackerClient } from './utils/tracker-client';
import { AppShell } from './components/shell/app-shell';

render(
  () => (
    <WheelApp client={trackerClient()}>
      <AppShell />
    </WheelApp>
  ),
  document.getElementById('root')!
);
