/* eslint-disable wheel/require-view-root -- Isolated catalog fixtures render library parts and icons; the catalog owns their inspection boundary. */
import type { JSX } from 'solid-js';
import { Checkbox } from 'wheel/components';

// Wheel supplies the component recipe classes.
export default function ExampleCheckbox() {
  return (
    <label style={{ display: 'flex', 'align-items': 'center', gap: '0.5rem' }}>
      <Checkbox.Root defaultChecked>
        <Checkbox.Indicator>
          <CheckIcon />
        </Checkbox.Indicator>
      </Checkbox.Root>
      Enable notifications
    </label>
  );
}

function CheckIcon(props: JSX.IntrinsicElements['svg']) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      {...props}
      style={{ display: 'block' }}
    >
      <path d="m2.5 8.5 4 4 7-9" />
    </svg>
  );
}
