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
      <WheelAnnotate />
    </WheelApp>
  ),
  document.getElementById('root')!
);
