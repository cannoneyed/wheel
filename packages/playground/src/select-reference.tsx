/* eslint-disable wheel/require-view-root -- ComponentReferencePage owns these nested examples. */
import { Select } from 'wheel/components';

import type { ComponentReferenceDefinition } from './component-reference';
import { AppleSelect, apples } from './component-demos/select';

function BasicExample() {
  return <AppleSelect label="Apple" placeholder="Select apple" />;
}

function DensityExample() {
  return (
    <div class="button-reference-example-row">
      <AppleSelect label="Compact" size="sm" defaultValue="gala" />
      <AppleSelect label="Comfortable" size="lg" defaultValue="honeycrisp" />
    </div>
  );
}

function StatusExample() {
  return (
    <div class="button-reference-example-row">
      <AppleSelect label="Ready" status="success" defaultValue="gala" />
      <AppleSelect label="Needs review" status="warning" defaultValue="fuji" />
      <AppleSelect label="Invalid choice" status="error" defaultValue="pink-lady" />
    </div>
  );
}

function MultipleExample() {
  return (
    <Select.Root items={apples} multiple defaultValue={['gala', 'fuji']}>
      <Select.Label>Apples</Select.Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Icon>⌄</Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner sideOffset={4}>
          <Select.Popup>
            <Select.List>
              {apples.map((apple) => (
                <Select.Item value={apple.value}>
                  <Select.ItemIndicator>✓</Select.ItemIndicator>
                  <Select.ItemText>{apple.label}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

export const SELECT_REFERENCE: ComponentReferenceDefinition = {
  usageCode: `import { Select } from 'wheel/components';

<Select.Root items={apples}>
  <Select.Label>Apple</Select.Label>
  <Select.Trigger>
    <Select.Value placeholder="Select apple" />
    <Select.Icon><CaretIcon /></Select.Icon>
  </Select.Trigger>
  <Select.Portal>
    <Select.Positioner sideOffset={4}>
      <Select.Popup>
        <Select.List>
          {apples.map((apple) => (
            <Select.Item value={apple.value}>
              <Select.ItemIndicator><CheckIcon /></Select.ItemIndicator>
              <Select.ItemText>{apple.label}</Select.ItemText>
            </Select.Item>
          ))}
        </Select.List>
      </Select.Popup>
    </Select.Positioner>
  </Select.Portal>
</Select.Root>`,
  props: [
    { name: 'value', type: 'Value | Value[] | null', defaultValue: '—', description: 'Controls the selected value or values.' },
    { name: 'defaultValue', type: 'Value | Value[] | null', defaultValue: 'null / []', description: 'Sets the initial uncontrolled selection.' },
    { name: 'onValueChange', type: '(value, details) => void', defaultValue: '—', description: 'Reports a requested value change before uncontrolled state commits.' },
    { name: 'open', type: 'boolean', defaultValue: '—', description: 'Controls whether the popup is open.' },
    { name: 'defaultOpen', type: 'boolean', defaultValue: 'false', description: 'Sets the initial uncontrolled popup state.' },
    { name: 'onOpenChange', type: '(open, details) => void', defaultValue: '—', description: 'Reports open and close requests with their reason.' },
    { name: 'multiple', type: 'boolean', defaultValue: 'false', description: 'Toggles multiple values and keeps the popup open after selection.' },
    { name: 'items', type: 'Item[] | Group[] | Record<string, JSX.Element>', defaultValue: '—', description: 'Supplies value labels and optional groups.' },
    { name: 'size', type: "'sm' | 'md' | 'lg'", defaultValue: "'md'", description: 'Sets trigger and option density together.' },
    { name: 'variant', type: "'input' | 'ghost'", defaultValue: "'input'", description: 'Sets the resting trigger surface.' },
    { name: 'status', type: "'success' | 'warning' | 'error'", defaultValue: '—', description: 'Adds a visual validation tone without changing validity.' },
    { name: 'disabled', type: 'boolean', defaultValue: 'false', description: 'Blocks focus, opening, and value changes.' },
    { name: 'readOnly', type: 'boolean', defaultValue: 'false', description: 'Allows inspection while blocking value changes.' },
    { name: 'required', type: 'boolean', defaultValue: 'false', description: 'Connects required state to form validation.' },
    { name: 'name / form / autoComplete', type: 'string', defaultValue: '—', description: 'Configures the hidden native form controls.' },
    { name: 'itemToStringLabel', type: '(value: Value) => string', defaultValue: '—', description: 'Resolves object values for trigger display.' },
    { name: 'itemToStringValue', type: '(value: Value) => string', defaultValue: '—', description: 'Resolves object values for form submission.' },
    { name: 'isItemEqualToValue', type: '(item, value) => boolean', defaultValue: 'Object.is', description: 'Compares complex option values.' },
    { name: 'modal', type: 'boolean', defaultValue: 'true', description: 'Controls modal focus and outside interaction while open.' },
    { name: 'highlightItemOnHover', type: 'boolean', defaultValue: 'true', description: 'Lets pointer movement update the active option.' },
    { name: 'Positioner.alignItemWithTrigger', type: 'boolean', defaultValue: 'false', description: 'Overlaps the trigger and aligns the selected option text when space allows.' },
    { name: 'as / asChild', type: 'ElementType / boolean', defaultValue: '— / false', description: 'Changes a rendered part without adding wrappers.' },
    { name: 'class / style', type: 'value | state function', defaultValue: '—', description: 'Styles each part from its resolved open, value, focus, size, and status state.' },
  ],
  examples: [
    {
      title: 'Single selection',
      description: 'A complete label, trigger, popup, list, and option composition.',
      component: BasicExample,
      code: `<AppleSelect label="Apple" placeholder="Select apple" />`,
    },
    {
      title: 'Shared density',
      description: 'Size changes both the closed trigger and open option rows.',
      component: DensityExample,
      code: `<Select.Root size="sm" items={apples}>…</Select.Root>\n<Select.Root size="lg" items={apples}>…</Select.Root>`,
    },
    {
      title: 'Validation status',
      description: 'Status adds a tone while field validation remains separate.',
      component: StatusExample,
      code: `<Select.Root status="success" items={apples}>…</Select.Root>\n<Select.Root status="warning" items={apples}>…</Select.Root>\n<Select.Root status="error" items={apples}>…</Select.Root>`,
    },
    {
      title: 'Multiple selection',
      description: 'Each option toggles independently and the popup stays open.',
      component: MultipleExample,
      code: `<Select.Root multiple defaultValue={['gala', 'fuji']} items={apples}>\n  {/* Use the same trigger, popup, list, and item parts. */}\n</Select.Root>`,
    },
  ],
};
