/* eslint-disable wheel/require-component-role -- The catalog demonstrates the components themselves: every fixture here IS a Button or a Dialog, so a role would name the catalog rather than tell two instances of one app apart. */
/* eslint-disable wheel/require-view-root -- Isolated catalog fixtures render library parts and icons; the catalog owns their inspection boundary. */
import type { JSX } from 'solid-js';
import { Collapsible } from 'wheel/components';

// Wheel supplies the component recipe classes.
// The panel animates via the library-measured --collapsible-panel-height variable.
export default function ExampleCollapsible() {
  return (
    <Collapsible.Root>
      <Collapsible.Trigger>
        Recovery keys
        <CaretRightIcon class="wheel-Collapsible-Icon" />
      </Collapsible.Trigger>
      <Collapsible.Panel>
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '0.5rem', padding: '0.5rem 0.75rem' }}>
          <div>alien-bean-pasta</div>
          <div>wild-irish-burrito</div>
          <div>horse-battery-staple</div>
        </div>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}

function CaretRightIcon(props: JSX.IntrinsicElements['svg']) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="currentColor"
      {...props}
      style={{ display: 'block', ...(typeof props.style === 'object' ? props.style : {}) }}
    >
      <path d="M6 12V4l4.5 4z" />
    </svg>
  );
}
