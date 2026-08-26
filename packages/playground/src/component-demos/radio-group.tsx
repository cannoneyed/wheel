/* eslint-disable wheel/require-view-root -- The catalog owns this fixture boundary. */
import { Radio, RadioGroup } from 'wheel/components';

import { DemoGroup } from './demo-group';

export default function ExampleRadioGroup() {
  return (
    <div class="radio-family-fixture">
      <DemoGroup title="Vertical group">
        <RadioGroup class="radio-demo-group" aria-label="Best apple" defaultValue="fuji">
          <Option value="fuji">Fuji</Option>
          <Option value="gala">Gala</Option>
          <Option value="granny-smith">Granny Smith</Option>
        </RadioGroup>
      </DemoGroup>
      <DemoGroup title="Horizontal group">
        <RadioGroup class="radio-demo-group radio-demo-group--horizontal" aria-label="Density" defaultValue="compact">
          <Option value="compact">Compact</Option>
          <Option value="balanced">Balanced</Option>
          <Option value="spacious">Spacious</Option>
        </RadioGroup>
      </DemoGroup>
      <DemoGroup title="Constraints">
        <RadioGroup class="radio-demo-group" aria-label="Plan" defaultValue="team" required>
          <Option value="personal">Personal</Option>
          <Option value="team">Team</Option>
          <Option value="enterprise" disabled>Enterprise</Option>
        </RadioGroup>
      </DemoGroup>
    </div>
  );
}

function Option(props: {
  readonly value: string;
  readonly disabled?: boolean | undefined;
  readonly children: string;
}) {
  return (
    <label class="radio-demo-option">
      <Radio.Root value={props.value} disabled={props.disabled}>
        <Radio.Indicator />
      </Radio.Root>
      {props.children}
    </label>
  );
}
