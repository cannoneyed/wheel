import { render } from 'solid-js/web';
import { WheelApp } from 'wheel/debug';

import { client } from './client';
import { TodoList } from './todo-list';

render(
  () => (
    <WheelApp client={client}>
      <TodoList />
    </WheelApp>
  ),
  document.getElementById('root')!
);
