/**
 * Todos demo — the local-first baseline. Try it: kill the demo server (or go
 * offline in devtools), keep adding todos, reload the page, bring the
 * network back. Nothing is lost, nothing blanks, everything converges.
 *
 * Hardening: `n` focuses the add input, `mod+backspace` clears completed
 * todos (through a confirm dialog), and every row has a right-click menu.
 * Composition only — each connected component lives in its own module.
 */
import { ContextMenuSystem, DialogSystem, KeyboardSystem } from 'wheel/kit';
import { WheelApp } from 'wheel/debug';
import { WheelAnnotate } from 'wheel/annotate';

import { demoClient } from '../shared/utils/demo-client';
import { DemoStage } from '../shared/components/demo-stage';
import { TodoList } from './components/todo-list';
import wheelConfig from '../wheel.config';

/** The demo root the shell mounts. */
export function TodosDemo() {
  return (
    <WheelApp client={demoClient('todos')} config={wheelConfig}>
      <DemoStage title="Todos">
        <TodoList />
      </DemoStage>
      <KeyboardSystem />
      <ContextMenuSystem />
      <DialogSystem />
      <WheelAnnotate />
    </WheelApp>
  );
}
