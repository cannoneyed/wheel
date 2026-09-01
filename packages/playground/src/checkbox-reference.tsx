/* eslint-disable wheel/require-component-role -- The catalog demonstrates the components themselves: every fixture here IS a Button or a Dialog, so a role would name the catalog rather than tell two instances of one app apart. */
/* eslint-disable wheel/require-view-root -- ComponentReferencePage owns these nested examples. */
import { Checkbox } from 'wheel/components';
import { useSignal } from 'wheel/core';
import type { ComponentReferenceDefinition } from './component-reference';
import { CheckboxControl, CheckboxMark } from './component-demos/checkbox-parts';

function ControlledExample() {
  const [checked, setChecked] = useSignal(false, 'checkboxReferenceChecked');
  return (
    <div class="button-reference-example-row">
      <CheckboxControl
        label="Include archived projects"
        checked={checked()}
        onCheckedChange={setChecked}
      />
      <output>{checked() ? 'Included' : 'Excluded'}</output>
    </div>
  );
}

function MixedExample() {
  return <CheckboxControl label="Some projects selected" indeterminate />;
}

function StatusExample() {
  return (
    <div class="button-reference-example-row">
      <CheckboxControl label="Verified" status="success" defaultChecked />
      <CheckboxControl label="Needs review" status="warning" defaultChecked />
      <CheckboxControl label="Required" status="error" defaultChecked />
    </div>
  );
}

export const CHECKBOX_REFERENCE: ComponentReferenceDefinition = {
  usageCode: `import { Checkbox } from 'wheel/components';

<label>
  <Checkbox.Root defaultChecked>
    <Checkbox.Indicator>
      <CheckIcon />
    </Checkbox.Indicator>
  </Checkbox.Root>
  Include archived projects
</label>`,
  props: [
    { name: 'checked', type: 'boolean', defaultValue: '—', description: 'Controls the boolean value.' },
    { name: 'defaultChecked', type: 'boolean', defaultValue: 'false', description: 'Sets the initial uncontrolled value.' },
    { name: 'onCheckedChange', type: '(checked, details) => void', defaultValue: '—', description: 'Requests a value change before uncontrolled state commits.' },
    { name: 'indeterminate', type: 'boolean', defaultValue: 'false', description: 'Exposes mixed state through aria-checked and the Indicator.' },
    { name: 'size', type: "'sm' | 'md'", defaultValue: "'md'", description: 'Sets a 14- or 16-pixel control.' },
    { name: 'status', type: "'default' | 'success' | 'warning' | 'error'", defaultValue: "'default'", description: 'Sets the control validation tone.' },
    { name: 'disabled', type: 'boolean', defaultValue: 'false', description: 'Blocks activation and removes sequential focus.' },
    { name: 'readOnly', type: 'boolean', defaultValue: 'false', description: 'Blocks changes while preserving focus and selected styling.' },
    { name: 'required', type: 'boolean', defaultValue: 'false', description: 'Sets native and ARIA required state.' },
    { name: 'name / value / form', type: 'string', defaultValue: '—', description: 'Configures the hidden native checkbox input.' },
    { name: 'uncheckedValue', type: 'string', defaultValue: '—', description: 'Submits an explicit value while unchecked.' },
    { name: 'parent', type: 'boolean', defaultValue: 'false', description: 'Controls allValues inside CheckboxGroup.' },
    { name: 'inputRef', type: '(input) => void', defaultValue: '—', description: 'Receives the hidden native input.' },
    { name: 'as / asChild', type: 'ElementType / boolean', defaultValue: '— / false', description: 'Changes the Root element without removing checkbox behavior.' },
    { name: 'Indicator.keepMounted', type: 'boolean', defaultValue: 'false', description: 'Keeps Indicator mounted while unchecked.' },
    { name: 'class / style', type: 'value | state function', defaultValue: '—', description: 'Styles resolved value, constraints, size, status, and validity.' },
  ],
  examples: [
    {
      title: 'Controlled value',
      description: 'The owner applies each requested boolean value.',
      component: ControlledExample,
      code: `<Checkbox.Root
  checked={includeArchived()}
  onCheckedChange={setIncludeArchived}
>
  <Checkbox.Indicator><CheckIcon /></Checkbox.Indicator>
</Checkbox.Root>`,
    },
    {
      title: 'Mixed value',
      description: 'The owner keeps mixed state until it resolves the partial selection.',
      component: MixedExample,
      code: `<Checkbox.Root indeterminate>
  <Checkbox.Indicator><MixedIcon /></Checkbox.Indicator>
</Checkbox.Root>`,
    },
    {
      title: 'Validation tones',
      description: 'Status changes the control tone without changing its meaning or size.',
      component: StatusExample,
      code: `<Checkbox.Root status="success" defaultChecked>
  <Checkbox.Indicator><CheckIcon /></Checkbox.Indicator>
</Checkbox.Root>`,
    },
    {
      title: 'Custom indicator',
      description: 'Indicator content stays caller-owned and follows Root state.',
      component: () => (
        <Checkbox.Root defaultChecked aria-label="Custom mark">
          <Checkbox.Indicator><CheckboxMark /></Checkbox.Indicator>
        </Checkbox.Root>
      ),
      code: `<Checkbox.Indicator>
  <CheckIcon />
</Checkbox.Indicator>`,
    },
  ],
};
