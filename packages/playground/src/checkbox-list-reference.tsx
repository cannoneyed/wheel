/* eslint-disable wheel/require-component-role -- The catalog demonstrates the components themselves: every fixture here IS a Button or a Dialog, so a role would name the catalog rather than tell two instances of one app apart. */
import { CheckboxList, CheckboxListItem } from 'wheel/components';
import type { ComponentReferenceDefinition } from './component-reference';

function RichRowsExample() {
  return (
    <CheckboxList label="Project access" defaultValue={['edit']} hasDividers>
      <CheckboxListItem value="view" label="View" description="Read project content" endContent="All" />
      <CheckboxListItem value="edit" label="Edit" description="Change project content" endContent="Editors" />
    </CheckboxList>
  );
}

function ErrorExample() {
  return (
    <CheckboxList
      label="Notification channels"
      description="Choose how updates arrive"
      status="error"
      statusMessage="Choose at least one channel"
    >
      <CheckboxListItem value="email" label="Email" />
      <CheckboxListItem value="push" label="Push" />
    </CheckboxList>
  );
}

function ReadOnlyExample() {
  return (
    <CheckboxList label="Managed channels" readOnly defaultValue={['email']}>
      <CheckboxListItem value="email" label="Email" />
      <CheckboxListItem value="push" label="Push" />
    </CheckboxList>
  );
}

export const CHECKBOX_LIST_REFERENCE: ComponentReferenceDefinition = {
  usageCode: `import { CheckboxList, CheckboxListItem } from 'wheel/components';

<CheckboxList label="Notification channels" defaultValue={['email']}>
  <CheckboxListItem value="email" label="Email" />
  <CheckboxListItem value="push" label="Push" />
</CheckboxList>`,
  props: [
    { name: 'label', type: 'JSX.Element', defaultValue: '—', description: 'Required visible label and group name.' },
    { name: 'description', type: 'JSX.Element', defaultValue: '—', description: 'Supporting text linked to the group.' },
    { name: 'statusMessage', type: 'JSX.Element', defaultValue: '—', description: 'Validation text linked to the group and announced politely on update.' },
    { name: 'children', type: 'CheckboxListItem[]', defaultValue: '—', description: 'Rows with unique collection values.' },
    { name: 'value', type: 'string[]', defaultValue: '—', description: 'Controls selected values.' },
    { name: 'defaultValue', type: 'string[]', defaultValue: '[]', description: 'Sets initial uncontrolled values.' },
    { name: 'onValueChange', type: '(value, details) => void', defaultValue: '—', description: 'Requests a value-array change.' },
    { name: 'allValues', type: 'string[]', defaultValue: '—', description: 'Enables a parent tri-state item.' },
    { name: 'density', type: "'compact' | 'balanced' | 'spacious'", defaultValue: "'compact'", description: 'Sets row height, padding, and spacing.' },
    { name: 'orientation', type: "'horizontal' | 'vertical'", defaultValue: "'vertical'", description: 'Sets row flow.' },
    { name: 'hasDividers', type: 'boolean', defaultValue: 'false', description: 'Adds separators between adjacent rows.' },
    { name: 'size', type: "'sm' | 'md'", defaultValue: "'md'", description: 'Sets the inherited Checkbox size.' },
    { name: 'status', type: "'default' | 'success' | 'warning' | 'error'", defaultValue: "'default'", description: 'Sets field, message, and Checkbox tone.' },
    { name: 'disabled', type: 'boolean', defaultValue: 'false', description: 'Disables every row.' },
    { name: 'readOnly', type: 'boolean', defaultValue: 'false', description: 'Blocks every change while preserving focus.' },
    { name: 'class / style', type: 'value | state function', defaultValue: '—', description: 'Styles the field container from resolved list state.' },
  ],
  examples: [
    {
      title: 'Rich rows with dividers',
      description: 'Description and passive end content stay aligned within each row.',
      component: RichRowsExample,
      code: `<CheckboxList label="Project access" defaultValue={['edit']} hasDividers>
  <CheckboxListItem
    value="view"
    label="View"
    description="Read project content"
    endContent="All"
  />
</CheckboxList>`,
    },
    {
      title: 'Validation message',
      description: 'Description and error text both describe the named group.',
      component: ErrorExample,
      code: `<CheckboxList
  label="Notification channels"
  description="Choose how updates arrive"
  status="error"
  statusMessage="Choose at least one channel"
>
  …
</CheckboxList>`,
    },
    {
      title: 'Read-only values',
      description: 'Read-only rows keep focus and selected styling without accepting changes.',
      component: ReadOnlyExample,
      code: `<CheckboxList label="Managed channels" readOnly defaultValue={['email']}>
  <CheckboxListItem value="email" label="Email" />
  <CheckboxListItem value="push" label="Push" />
</CheckboxList>`,
    },
  ],
};
