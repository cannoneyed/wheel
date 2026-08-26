/* eslint-disable wheel/require-view-root -- The catalog owns this fixture composition boundary. */
import { Field, Switch, type SwitchSize, type SwitchStatus } from 'wheel/components';

import { DemoGroup } from './demo-group';

function SwitchField(props: {
  readonly label: string;
  readonly size?: SwitchSize | undefined;
  readonly status?: SwitchStatus | undefined;
  readonly defaultChecked?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  readonly readOnly?: boolean | undefined;
}) {
  return (
    <Field.Root class="switch-demo-field">
      <Switch.Root
        size={props.size}
        status={props.status}
        defaultChecked={props.defaultChecked}
        disabled={props.disabled}
        readOnly={props.readOnly}
      >
        <Switch.Thumb />
      </Switch.Root>
      <Field.Label>{props.label}</Field.Label>
    </Field.Root>
  );
}

export default function ExampleSwitch() {
  return (
    <div class="switch-family-fixture">
      <DemoGroup title="Values">
        <SwitchField label="Off" />
        <SwitchField label="On" defaultChecked />
      </DemoGroup>

      <DemoGroup title="Sizes">
        <SwitchField label="Small" size="sm" />
        <SwitchField label="Medium" size="md" defaultChecked />
      </DemoGroup>

      <DemoGroup title="Validation status">
        <SwitchField label="Success" status="success" defaultChecked />
        <SwitchField label="Warning" status="warning" defaultChecked />
        <SwitchField label="Error" status="error" defaultChecked />
      </DemoGroup>

      <DemoGroup title="Constraints">
        <SwitchField label="Disabled" disabled />
        <SwitchField label="Read only" readOnly defaultChecked />
      </DemoGroup>
    </div>
  );
}
