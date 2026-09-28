import { render } from 'solid-js/web';
import { WheelApp } from 'wheel/debug';

import { client } from './client';
import { TodoList } from './todo-list';
import wheelConfig from './wheel.config';

render(
  () => (
    <WheelApp client={client} config={wheelConfig}>
      <TodoList />
    </WheelApp>
  ),
  document.getElementById('root')!
);
