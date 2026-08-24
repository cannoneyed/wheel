/* eslint-disable wheel/require-view-root -- Isolated catalog fixtures render library parts and icons; the catalog owns their inspection boundary. */
import { createUniqueId, type JSX } from 'solid-js';
import { Checkbox, CheckboxGroup } from 'wheel/components';

// Wheel supplies the component recipe classes.
export default function ExampleCheckboxGroup() {
  const id = createUniqueId();
  return (
    <CheckboxGroup aria-labelledby={id} defaultValue={['fuji-apple']}>
      <div
        id={id}
        style={{ 'font-size': 'var(--wheel-component-text-base)', 'font-weight': 500 }}
      >
        Apples
      </div>

      <label style={{ display: 'flex', 'align-items': 'center', gap: '0.5rem' }}>
        <Checkbox.Root name="apple" value="fuji-apple">
          <Checkbox.Indicator>
            <CheckIcon />
          </Checkbox.Indicator>
        </Checkbox.Root>
        Fuji
      </label>

      <label style={{ display: 'flex', 'align-items': 'center', gap: '0.5rem' }}>
        <Checkbox.Root name="apple" value="gala-apple">
          <Checkbox.Indicator>
            <CheckIcon />
          </Checkbox.Indicator>
        </Checkbox.Root>
        Gala
      </label>

      <label style={{ display: 'flex', 'align-items': 'center', gap: '0.5rem' }}>
        <Checkbox.Root name="apple" value="granny-smith-apple">
          <Checkbox.Indicator>
            <CheckIcon />
          </Checkbox.Indicator>
        </Checkbox.Root>
        Granny Smith
      </label>
    </CheckboxGroup>
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
