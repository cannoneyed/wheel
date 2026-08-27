import { viewRoot } from 'wheel/core';
import { CheckboxList, CheckboxListItem } from 'wheel/components';
import { DemoGroup } from './demo-group';

export default function ExampleCheckboxList() {
  return (
    <div use:viewRoot={'ExampleCheckboxList'} class="checkbox-family-fixture checkbox-family-fixture--documented">
      <DemoGroup title="Density">
        <div class="checkbox-family-columns">
          <CompactList density="compact" />
          <CompactList density="balanced" />
          <CompactList density="spacious" />
        </div>
      </DemoGroup>

      <DemoGroup title="Dividers and rich rows">
        <CheckboxList label="Project access" defaultValue={['edit']} hasDividers>
          <CheckboxListItem
            value="view"
            label="View"
            description="Read project content"
            endContent="All members"
          />
          <CheckboxListItem
            value="edit"
            label="Edit"
            description="Change project content"
            endContent="Editors"
          />
          <CheckboxListItem
            value="admin"
            label="Admin"
            description="Manage access and settings"
            endContent="2 people"
          />
        </CheckboxList>
      </DemoGroup>

      <DemoGroup title="Validation and constraints">
        <div class="checkbox-family-columns">
          <CheckboxList
            label="Required channels"
            status="error"
            statusMessage="Choose at least one channel"
          >
            <CheckboxListItem value="email" label="Email" />
            <CheckboxListItem value="push" label="Push" />
          </CheckboxList>
          <CheckboxList label="Managed channels" readOnly defaultValue={['email']}>
            <CheckboxListItem value="email" label="Email" />
            <CheckboxListItem value="push" label="Push" />
          </CheckboxList>
        </div>
      </DemoGroup>
    </div>
  );
}

function CompactList(props: { readonly density: 'compact' | 'balanced' | 'spacious' }) {
  return (
    <CheckboxList
      label={capitalize(props.density)}
      density={props.density}
      defaultValue={['one']}
    >
      <CheckboxListItem value="one" label="First" />
      <CheckboxListItem value="two" label="Second" />
    </CheckboxList>
  );
}

function capitalize(value: string): string {
  return value[0]!.toUpperCase() + value.slice(1);
}
