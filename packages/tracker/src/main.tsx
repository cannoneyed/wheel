/** Axle entry: theme tokens, the client, the provider, the shell. */
import { render } from 'solid-js/web';
import { WheelApp } from 'wheel/debug';
import { WheelAnnotate } from 'wheel/annotate';

import './styles/tokens.css';
import { trackerClient } from './utils/tracker-client';
import { AppShell } from './components/shell/app-shell';
import wheelConfig from './wheel.config';

render(
  () => (
    <WheelApp client={trackerClient()} config={wheelConfig}>
      <AppShell />
      {/* On in every build: see annotate.enabled in wheel.config.ts. */}
      <WheelAnnotate />
    </WheelApp>
  ),
  document.getElementById('root')!
);
