/* eslint-disable wheel/require-view-root -- The default export marks the catalog entry; the helpers below it are scaffolding, and marking them would put catalog noise between the reader and the library part on show. */
import { viewRoot } from 'wheel/core';
import { CheckboxGroup } from 'wheel/components';
import { CheckboxControl } from './checkbox-parts';
import { DemoGroup } from './demo-group';

export default function ExampleCheckboxGroup() {
  return (
    <div use:viewRoot={'ExampleCheckboxGroup'} class="checkbox-family-fixture checkbox-family-fixture--documented">
      <DemoGroup title="Density">
        <div class="checkbox-family-columns">
          <LabeledGroup label="Compact" density="compact" />
          <LabeledGroup label="Balanced" density="balanced" />
          <LabeledGroup label="Spacious" density="spacious" />
        </div>
      </DemoGroup>

      <DemoGroup title="Horizontal layout">
        <CheckboxGroup
          aria-label="Export fields"
          defaultValue={['title']}
          orientation="horizontal"
        >
          <CheckboxControl label="Title" value="title" />
          <CheckboxControl label="Owner" value="owner" />
          <CheckboxControl label="Updated" value="updated" />
        </CheckboxGroup>
      </DemoGroup>

      <DemoGroup title="Parent selection" description="The parent reports mixed state while some children are selected.">
        <CheckboxGroup
          aria-label="Notifications"
          allValues={['email', 'push', 'sms']}
          defaultValue={['email']}
          data-testid="checkbox-group-parent"
        >
          <CheckboxControl label="All notifications" parent data-testid="checkbox-parent" />
          <CheckboxControl label="Email" value="email" />
          <CheckboxControl label="Push" value="push" />
          <CheckboxControl label="SMS" value="sms" disabled />
        </CheckboxGroup>
      </DemoGroup>

      <DemoGroup title="Group constraints">
        <div class="checkbox-family-columns">
          <CheckboxGroup aria-label="Disabled options" disabled defaultValue={['one']}>
            <CheckboxControl label="Disabled selected" value="one" />
            <CheckboxControl label="Disabled clear" value="two" />
          </CheckboxGroup>
          <CheckboxGroup aria-label="Read-only options" readOnly defaultValue={['one']}>
            <CheckboxControl label="Read-only selected" value="one" />
            <CheckboxControl label="Read-only clear" value="two" />
          </CheckboxGroup>
        </div>
      </DemoGroup>
    </div>
  );
}

function LabeledGroup(props: {
  readonly label: string;
  readonly density: 'compact' | 'balanced' | 'spacious';
}) {
  return (
    <div class="checkbox-family-sample">
      <strong>{props.label}</strong>
      <CheckboxGroup
        aria-label={`${props.label} options`}
        density={props.density}
        defaultValue={['one']}
      >
        <CheckboxControl label="First" value="one" />
        <CheckboxControl label="Second" value="two" />
      </CheckboxGroup>
    </div>
  );
}
