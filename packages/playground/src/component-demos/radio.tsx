/* eslint-disable wheel/require-view-root -- Isolated catalog fixtures render library parts and icons; the catalog owns their inspection boundary. */
import { createUniqueId } from 'solid-js';
import { Radio, RadioGroup } from 'wheel/components';

// Wheel supplies the component recipe classes.
export default function ExampleRadioGroup() {
  const id = createUniqueId();
  return (
    <RadioGroup aria-labelledby={id} defaultValue="fuji-apple">
      <div id={id} style={{ 'font-size': 'var(--wheel-component-text-base)', 'font-weight': 500 }}>
        Best apple
      </div>

      <label style={{ display: 'flex', 'align-items': 'center', gap: '0.5rem' }}>
        <Radio.Root value="fuji-apple">
          <Radio.Indicator />
        </Radio.Root>
        Fuji
      </label>

      <label style={{ display: 'flex', 'align-items': 'center', gap: '0.5rem' }}>
        <Radio.Root value="gala-apple">
          <Radio.Indicator />
        </Radio.Root>
        Gala
      </label>

      <label style={{ display: 'flex', 'align-items': 'center', gap: '0.5rem' }}>
        <Radio.Root value="granny-smith-apple">
          <Radio.Indicator />
        </Radio.Root>
        Granny Smith
      </label>
    </RadioGroup>
  );
}
