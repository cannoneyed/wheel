/* eslint-disable wheel/require-view-root -- The catalog owns this fixture's inspection boundary. */
import { For } from 'solid-js';
import { systemDefer, useSignal } from 'wheel/core';
import { Button, type ButtonSize, type ButtonVariant } from 'wheel/components';
import { ChevronIcon, PlusIcon } from './button-icons';
import { DemoGroup } from './demo-group';

const variants: readonly ButtonVariant[] = ['primary', 'secondary', 'ghost', 'destructive'];
const sizes: readonly ButtonSize[] = ['sm', 'md', 'lg'];

function hold(ms: number) {
  return new Promise<void>((resolve) => {
    systemDefer.schedule(ms, resolve);
  });
}

export default function ExampleButton() {
  const [runs, setRuns] = useSignal(0, 'buttonRuns');
  const [interrupts, setInterrupts] = useSignal(0, 'buttonInterrupts');

  return (
    <div class="button-family-fixture button-family-fixture--documented">
      <DemoGroup title="Variants" description="Choose visual weight from action priority and risk.">
        <For each={variants}>
          {(variant) => (
            <Button variant={variant} data-testid={variant === 'primary' ? 'focus-button' : undefined}>
              {variant}
            </Button>
          )}
        </For>
      </DemoGroup>

      <DemoGroup title="Sizes" description="All sizes keep dense application proportions.">
        <For each={sizes}>{(size) => <Button size={size}>{size}</Button>}</For>
      </DemoGroup>

      <DemoGroup title="Content" description="Keep the action label visible when adding supporting content.">
        <Button icon={<PlusIcon />}>Create</Button>
        <Button endContent={<ChevronIcon />}>Options</Button>
        <Button href="#button-link-target" data-testid="button-link">Link</Button>
      </DemoGroup>

      <DemoGroup title="States" description="Pending actions own their loading state and block duplicate work.">
        <Button disabled>Disabled</Button>
        <Button loading>Loading</Button>
        <Button
          clickAction={async () => {
            setRuns((count) => count + 1);
            await hold(220);
          }}
          data-runs={runs()}
          data-testid="button-async"
        >
          Save async
        </Button>
        <Button
          interruptible
          clickAction={async () => {
            setInterrupts((count) => count + 1);
            await hold(220);
          }}
          data-interrupts={interrupts()}
          data-testid="button-interruptible"
        >
          Refresh
        </Button>
      </DemoGroup>
    </div>
  );
}
