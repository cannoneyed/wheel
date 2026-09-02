import { render } from 'solid-js/web';
import { WheelAnnotate } from 'wheel/annotate';
import { WheelApp } from 'wheel/debug';
import { ContextMenuSystem, DialogSystem, KeyboardSystem } from 'wheel/kit';
import 'wheel/styles';

import { App } from './app';
import { chalkClient } from './chalk-client';
import './styles.css';

render(
  () => (
    <WheelApp client={chalkClient()}>
      <App />
      <KeyboardSystem />
      <ContextMenuSystem />
      <DialogSystem />
      <WheelAnnotate />
    </WheelApp>
  ),
  document.getElementById('root')!
);
