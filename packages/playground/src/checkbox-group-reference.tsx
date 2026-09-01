/* eslint-disable wheel/require-component-role -- The catalog demonstrates the components themselves: every fixture here IS a Button or a Dialog, so a role would name the catalog rather than tell two instances of one app apart. */
import { CheckboxGroup } from 'wheel/components';
import type { ComponentReferenceDefinition } from './component-reference';
import { CheckboxControl } from './component-demos/checkbox-parts';

function SelectionExample() {
  return (
    <CheckboxGroup aria-label="Export fields" defaultValue={['title']}>
      <CheckboxControl label="Title" value="title" />
      <CheckboxControl label="Owner" value="owner" />
      <CheckboxControl label="Updated" value="updated" />
    </CheckboxGroup>
  );
}

function HorizontalExample() {
  return (
    <CheckboxGroup aria-label="Visible columns" orientation="horizontal" density="balanced">
      <CheckboxControl label="Name" value="name" />
      <CheckboxControl label="Status" value="status" />
      <CheckboxControl label="Owner" value="owner" />
    </CheckboxGroup>
  );
}

function ParentExample() {
  return (
    <CheckboxGroup
      aria-label="Notifications"
      allValues={['email', 'push']}
      defaultValue={['email']}
    >
      <CheckboxControl label="All notifications" parent />
      <CheckboxControl label="Email" value="email" />
      <CheckboxControl label="Push" value="push" />
    </CheckboxGroup>
  );
}

export const CHECKBOX_GROUP_REFERENCE: ComponentReferenceDefinition = {
  usageCode: `import { Checkbox, CheckboxGroup } from 'wheel/components';

<CheckboxGroup aria-label="Export fields" defaultValue={['title']}>
  <Checkbox.Root value="title">…</Checkbox.Root>
  <Checkbox.Root value="owner">…</Checkbox.Root>
</CheckboxGroup>`,
  props: [
    { name: 'children', type: 'Checkbox.Root[]', defaultValue: '—', description: 'Related controls with non-empty collection values.' },
    { name: 'value', type: 'string[]', defaultValue: '—', description: 'Controls the selected value array.' },
    { name: 'defaultValue', type: 'string[]', defaultValue: '[]', description: 'Sets initial uncontrolled values.' },
    { name: 'onValueChange', type: '(value, details) => void', defaultValue: '—', description: 'Requests a value-array change before it commits.' },
    { name: 'allValues', type: 'string[]', defaultValue: '—', description: 'Enables parent and child tri-state coordination.' },
    { name: 'orientation', type: "'horizontal' | 'vertical'", defaultValue: "'vertical'", description: 'Sets visual flow without changing Tab order.' },
    { name: 'density', type: "'compact' | 'balanced' | 'spacious'", defaultValue: "'compact'", description: 'Sets 4-, 8-, or 12-pixel member gaps.' },
    { name: 'size', type: "'sm' | 'md'", defaultValue: "'md'", description: 'Sets the default child Checkbox size.' },
    { name: 'status', type: "'default' | 'success' | 'warning' | 'error'", defaultValue: "'default'", description: 'Sets the default child validation tone.' },
    { name: 'disabled', type: 'boolean', defaultValue: 'false', description: 'Disables every child.' },
    { name: 'readOnly', type: 'boolean', defaultValue: 'false', description: 'Blocks every child change while preserving focus.' },
    { name: 'aria-label / aria-labelledby', type: 'string', defaultValue: '—', description: 'Names the group.' },
    { name: 'as / asChild', type: 'ElementType / boolean', defaultValue: '— / false', description: 'Changes the group element without changing context.' },
    { name: 'class / style', type: 'value | state function', defaultValue: '—', description: 'Styles layout, constraints, inherited values, and Field state.' },
  ],
  examples: [
    {
      title: 'Multi-value selection',
      description: 'Each Checkbox remains an independent Tab stop and updates one array value.',
      component: SelectionExample,
      code: `<CheckboxGroup aria-label="Export fields" defaultValue={['title']}>
  <Checkbox.Root value="title">…</Checkbox.Root>
  <Checkbox.Root value="owner">…</Checkbox.Root>
</CheckboxGroup>`,
    },
    {
      title: 'Horizontal layout',
      description: 'Horizontal orientation wraps controls in DOM order.',
      component: HorizontalExample,
      code: `<CheckboxGroup
  aria-label="Visible columns"
  orientation="horizontal"
  density="balanced"
>
  …
</CheckboxGroup>`,
    },
    {
      title: 'Parent selection',
      description: 'allValues lets one parent check, clear, or report mixed child state.',
      component: ParentExample,
      code: `<CheckboxGroup allValues={['email', 'push']} defaultValue={['email']}>
  <Checkbox.Root parent>…</Checkbox.Root>
  <Checkbox.Root value="email">…</Checkbox.Root>
  <Checkbox.Root value="push">…</Checkbox.Root>
</CheckboxGroup>`,
    },
  ],
};
