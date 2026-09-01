/* eslint-disable wheel/require-component-role -- The catalog demonstrates the components themselves: every fixture here IS a Button or a Dialog, so a role would name the catalog rather than tell two instances of one app apart. */
/* eslint-disable wheel/require-view-root -- The catalog owns this fixture's inspection boundary. */
import { For } from 'solid-js';
import { useSignal } from 'wheel/core';
import { Button, type ButtonSize, type ButtonVariant } from 'wheel/components';
import { ChevronIcon, PlusIcon } from './button-icons';
import { DemoGroup } from './demo-group';

const variants: readonly ButtonVariant[] = ['primary', 'secondary', 'ghost', 'destructive'];
const sizes: readonly ButtonSize[] = ['sm', 'md', 'lg'];

/**
 * A pending action that ends when someone says so, not when a timer says so.
 *
 * These buttons exist to show what a button looks like WHILE its action runs.
 * A fixed delay makes that state a race: a human blinks and misses it, and a
 * test asserting "busy, and still disabled" can lose to a loaded machine
 * between the two assertions — which is exactly how this fixture's browser
 * test started failing in CI.
 *
 * Holding until released fixes both. The pending state stays on screen for as
 * long as it is interesting, and a test can assert every part of it without
 * racing a clock.
 */
function createPendingActions() {
  let waiting: Array<() => void> = [];
  return {
    /** Begin an action that stays pending until `release` is called. */
    hold: () => new Promise<void>((resolve) => waiting.push(resolve)),
    /** Finish every action still pending. */
    release: () => {
      const resolvers = waiting;
      waiting = [];
      for (const resolve of resolvers) resolve();
    }
  };
}

export default function ExampleButton() {
  const [runs, setRuns] = useSignal(0, 'buttonRuns');
  const [interrupts, setInterrupts] = useSignal(0, 'buttonInterrupts');
  const pending = createPendingActions();

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

      <DemoGroup
        title="States"
        description="Pending actions own their loading state and block duplicate work. They stay pending until released, so the busy state is there to look at."
      >
        <Button disabled>Disabled</Button>
        <Button loading>Loading</Button>
        <Button
          clickAction={async () => {
            setRuns((count) => count + 1);
            await pending.hold();
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
            await pending.hold();
          }}
          data-interrupts={interrupts()}
          data-testid="button-interruptible"
        >
          Refresh
        </Button>
        <Button variant="secondary" onClick={() => pending.release()} data-testid="button-release">
          Release pending
        </Button>
      </DemoGroup>
    </div>
  );
}
