/* eslint-disable wheel/require-view-root -- ComponentReferencePage owns these nested examples. */
import { CheckboxListItem } from 'wheel/components';
import type { ComponentReferenceDefinition } from './component-reference';

function ContentExample() {
  return (
    <div class="checkbox-reference-list-item">
      <CheckboxListItem
        label="Email reports"
        description="Send one report every Monday"
        endContent="Weekly"
      />
    </div>
  );
}

function MixedExample() {
  return (
    <div class="checkbox-reference-list-item">
      <CheckboxListItem label="Some projects" indeterminate />
    </div>
  );
}

function ConstraintExample() {
  return (
    <div class="checkbox-reference-list-item">
      <CheckboxListItem label="Managed setting" readOnly defaultChecked />
      <CheckboxListItem label="Unavailable setting" disabled />
    </div>
  );
}

export const CHECKBOX_LIST_ITEM_REFERENCE: ComponentReferenceDefinition = {
  usageCode: `import { CheckboxListItem } from 'wheel/components';

<CheckboxListItem
  value="email"
  label="Email reports"
  description="Send one report every Monday"
  endContent="Weekly"
/>`,
  props: [
    { name: 'label', type: 'JSX.Element', defaultValue: '—', description: 'Required visible and accessible Checkbox label.' },
    { name: 'description', type: 'JSX.Element', defaultValue: '—', description: 'Supporting text linked to the Checkbox.' },
    { name: 'endContent', type: 'JSX.Element', defaultValue: '—', description: 'Passive metadata rendered at the row end.' },
    { name: 'value', type: 'string', defaultValue: '—', description: 'Required collection identity inside a group.' },
    { name: 'name', type: 'string', defaultValue: '—', description: 'Native form field name.' },
    { name: 'checked', type: 'boolean', defaultValue: '—', description: 'Controls standalone checked state.' },
    { name: 'defaultChecked', type: 'boolean', defaultValue: 'false', description: 'Sets initial standalone checked state.' },
    { name: 'onCheckedChange', type: '(checked, details) => void', defaultValue: '—', description: 'Requests a standalone value change.' },
    { name: 'indeterminate', type: 'boolean', defaultValue: 'false', description: 'Shows mixed state.' },
    { name: 'disabled', type: 'boolean', defaultValue: 'false', description: 'Blocks row and Checkbox activation.' },
    { name: 'readOnly', type: 'boolean', defaultValue: 'false', description: 'Blocks changes while preserving focus and selected styling.' },
    { name: 'required', type: 'boolean', defaultValue: 'false', description: 'Sets native and ARIA required state.' },
    { name: 'size', type: "'sm' | 'md'", defaultValue: 'inherited', description: 'Sets or inherits the Checkbox size.' },
    { name: 'status', type: "'default' | 'success' | 'warning' | 'error'", defaultValue: 'inherited', description: 'Sets or inherits validation tone.' },
    { name: 'class / style', type: 'value | state function', defaultValue: '—', description: 'Styles the row from constraints, size, and status.' },
  ],
  examples: [
    {
      title: 'Supporting content',
      description: 'The content column wraps while passive metadata stays aligned.',
      component: ContentExample,
      code: `<CheckboxListItem
  label="Email reports"
  description="Send one report every Monday"
  endContent="Weekly"
/>`,
    },
    {
      title: 'Mixed state',
      description: 'Indeterminate state renders the mixed mark and ARIA value.',
      component: MixedExample,
      code: `<CheckboxListItem label="Some projects" indeterminate />`,
    },
    {
      title: 'Read-only and disabled',
      description: 'Read-only preserves focus. Disabled removes sequential focus.',
      component: ConstraintExample,
      code: `<CheckboxListItem label="Managed setting" readOnly defaultChecked />
<CheckboxListItem label="Unavailable setting" disabled />`,
    },
  ],
};
