/* eslint-disable wheel/require-component-role -- The catalog demonstrates the components themselves: every fixture here IS a Button or a Dialog, so a role would name the catalog rather than tell two instances of one app apart. */
import { viewRoot } from 'wheel/core';
import { Field, Input, type InputSize, type InputStatus, type InputVariant } from 'wheel/components';

import { DemoGroup } from './demo-group';

function InputField(props: {
  readonly label: string;
  readonly placeholder?: string | undefined;
  readonly size?: InputSize | undefined;
  readonly variant?: InputVariant | undefined;
  readonly status?: InputStatus | undefined;
  readonly disabled?: boolean | undefined;
  readonly readOnly?: boolean | undefined;
}) {
  return (
    <Field.Root class="input-demo-control">
      <Field.Label>{props.label}</Field.Label>
      <Input
        placeholder={props.placeholder ?? 'Enter value'}
        size={props.size}
        variant={props.variant}
        status={props.status}
        disabled={props.disabled}
        readOnly={props.readOnly}
        defaultValue={props.readOnly ? 'Read-only value' : undefined}
      />
    </Field.Root>
  );
}

export default function ExampleInput() {
  return (
    <div use:viewRoot={'ExampleInput'} class="input-family-fixture">
      <DemoGroup title="Surfaces">
        <InputField label="Input" placeholder="Bordered field" />
        <InputField label="Ghost" variant="ghost" placeholder="Transparent field" />
        <InputField label="Quiet" variant="quiet" placeholder="Underline field" />
      </DemoGroup>

      <DemoGroup title="Sizes">
        <InputField label="Small" size="sm" />
        <InputField label="Medium" size="md" />
        <InputField label="Large" size="lg" />
      </DemoGroup>

      <DemoGroup title="Validation status">
        <InputField label="Success" status="success" />
        <InputField label="Warning" status="warning" />
        <InputField label="Error" status="error" />
      </DemoGroup>

      <DemoGroup title="Constraints">
        <InputField label="Disabled" disabled />
        <InputField label="Read only" readOnly />
      </DemoGroup>
    </div>
  );
}
