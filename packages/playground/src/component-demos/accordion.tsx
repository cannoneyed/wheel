/* eslint-disable wheel/require-component-role -- The catalog demonstrates the components themselves: every fixture here IS a Button or a Dialog, so a role would name the catalog rather than tell two instances of one app apart. */
/* eslint-disable wheel/require-view-root -- Isolated catalog fixtures render library parts and icons; the catalog owns their inspection boundary. */
import type { JSX } from 'solid-js';
import { Accordion } from 'wheel/components';

// Wheel supplies the component recipe classes.
// The panel animates via the library-measured --accordion-panel-height variable.
export default function ExampleAccordion() {
  return (
    <Accordion.Root>
      <Accordion.Item>
        <Accordion.Header>
          <Accordion.Trigger>
            What is Base UI?
            <PlusIcon class="wheel-Accordion-Icon" />
          </Accordion.Trigger>
        </Accordion.Header>
        <Accordion.Panel>
          <div style={{ padding: '0.5rem 1rem' }}>
            Base UI is a library of high-quality unstyled Solid components for design systems and
            web apps.
          </div>
        </Accordion.Panel>
      </Accordion.Item>

      <Accordion.Item>
        <Accordion.Header>
          <Accordion.Trigger>
            How do I get started?
            <PlusIcon class="wheel-Accordion-Icon" />
          </Accordion.Trigger>
        </Accordion.Header>
        <Accordion.Panel>
          <div style={{ padding: '0.5rem 1rem' }}>
            Head to the "Quick start" guide in the docs. If you've used unstyled libraries before,
            you'll feel at home.
          </div>
        </Accordion.Panel>
      </Accordion.Item>

      <Accordion.Item>
        <Accordion.Header>
          <Accordion.Trigger>
            Can I use it for my project?
            <PlusIcon class="wheel-Accordion-Icon" />
          </Accordion.Trigger>
        </Accordion.Header>
        <Accordion.Panel>
          <div style={{ padding: '0.5rem 1rem' }}>Of course! Base UI is free and open source.</div>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion.Root>
  );
}

function PlusIcon(props: JSX.IntrinsicElements['svg']) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-linecap="square"
      stroke-linejoin="round"
      {...props}
      style={{ display: 'block', ...(typeof props.style === 'object' ? props.style : {}) }}
    >
      <path d="M1.5 8h13M8 14.5v-13" />
    </svg>
  );
}
