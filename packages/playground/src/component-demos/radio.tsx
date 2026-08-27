/* eslint-disable wheel/require-view-root -- The default export marks the catalog entry; the helpers below it are scaffolding, and marking them would put catalog noise between the reader and the library part on show. */
import { viewRoot } from 'wheel/core';
import { Radio, RadioGroup } from 'wheel/components';

import { DemoGroup } from './demo-group';

export default function ExampleRadio() {
  return (
    <div use:viewRoot={'ExampleRadio'} class="radio-family-fixture">
      <DemoGroup title="Selection states">
        <RadioGroup aria-label="Radio states" defaultValue="selected">
          <RadioLabel value="selected" label="Selected" />
          <RadioLabel value="available" label="Available" />
          <RadioLabel value="disabled" label="Disabled" disabled />
        </RadioGroup>
      </DemoGroup>
      <DemoGroup title="Constraints">
        <RadioGroup aria-label="Radio constraints" defaultValue="readonly" readOnly>
          <RadioLabel value="readonly" label="Read only" />
          <RadioLabel value="unchanged" label="Cannot change" />
        </RadioGroup>
      </DemoGroup>
    </div>
  );
}

function RadioLabel(props: {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean | undefined;
}) {
  return (
    <label class="radio-demo-option">
      <Radio.Root value={props.value} disabled={props.disabled}>
        <Radio.Indicator />
      </Radio.Root>
      {props.label}
    </label>
  );
}
