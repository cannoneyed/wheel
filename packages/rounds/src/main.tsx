import { render } from 'solid-js/web';
import { WheelAnnotate } from 'wheel/annotate';
import { WheelApp } from 'wheel/debug';
import 'wheel/styles';

import { App } from './app';
import { roundsClient } from './rounds-client';
import './styles.css';

render(
  () => (
    <WheelApp client={roundsClient()}>
      <App />
      <WheelAnnotate />
    </WheelApp>
  ),
  document.getElementById('root')!
);
