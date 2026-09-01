/* eslint-disable wheel/require-component-role -- The catalog demonstrates the components themselves: every fixture here IS a Button or a Dialog, so a role would name the catalog rather than tell two instances of one app apart. */
/* eslint-disable wheel/require-view-root -- ComponentReferencePage owns these nested examples. */
import { Toggle, ToggleGroup } from 'wheel/components';

import type { ComponentReferenceDefinition } from './component-reference';

function SingleSelectionExample() {
  return (
    <ToggleGroup aria-label="Text alignment" defaultValue="left">
      <Toggle value="left" label="Left">Left</Toggle>
      <Toggle value="center" label="Center">Center</Toggle>
      <Toggle value="right" label="Right">Right</Toggle>
    </ToggleGroup>
  );
}

function MultipleSelectionExample() {
  return (
    <ToggleGroup
      aria-label="Text formatting"
      type="multiple"
      defaultValue={['bold', 'italic']}
    >
      <Toggle value="bold" label="Bold">Bold</Toggle>
      <Toggle value="italic" label="Italic">Italic</Toggle>
      <Toggle value="underline" label="Underline">Underline</Toggle>
    </ToggleGroup>
  );
}

function FillLayoutExample() {
  return (
    <div class="button-reference-fill-example">
      <ToggleGroup aria-label="View" defaultValue="list" layout="fill">
        <Toggle value="list" label="List">List</Toggle>
        <Toggle value="board" label="Board">Board</Toggle>
        <Toggle value="timeline" label="Timeline">Timeline</Toggle>
      </ToggleGroup>
    </div>
  );
}

function VerticalLayoutExample() {
  return (
    <ToggleGroup aria-label="Dock position" defaultValue="left" orientation="vertical">
      <Toggle value="left" label="Left">Left</Toggle>
      <Toggle value="right" label="Right">Right</Toggle>
    </ToggleGroup>
  );
}

export const TOGGLE_GROUP_REFERENCE: ComponentReferenceDefinition = {
  usageCode: `import { Toggle, ToggleGroup } from 'wheel/components';

<ToggleGroup aria-label="Text alignment" defaultValue="left">
  <Toggle value="left" label="Left">Left</Toggle>
  <Toggle value="center" label="Center">Center</Toggle>
  <Toggle value="right" label="Right">Right</Toggle>
</ToggleGroup>`,
  props: [
    { name: 'children', type: 'Toggle[]', defaultValue: '—', description: 'Direct Toggle children with unique non-empty values.' },
    { name: 'aria-label / aria-labelledby', type: 'string', defaultValue: '—', description: 'Names the group for assistive technology.' },
    { name: 'type', type: "'single' | 'multiple'", defaultValue: "'single'", description: 'Sets the public value shape and selection rule.' },
    { name: 'value', type: 'string | null | readonly string[]', defaultValue: '—', description: 'Controls the typed selected value.' },
    { name: 'defaultValue', type: 'string | null | readonly string[]', defaultValue: 'null / []', description: 'Sets initial uncontrolled selection.' },
    { name: 'onValueChange', type: '(value, details) => void', defaultValue: '—', description: 'Requests a typed value change before it commits.' },
    { name: 'orientation', type: "'horizontal' | 'vertical'", defaultValue: "'horizontal'", description: 'Sets layout and arrow-key direction.' },
    { name: 'layout', type: "'hug' | 'fill'", defaultValue: "'hug'", description: 'Hugs content or gives direct Toggles equal available width.' },
    { name: 'size', type: "'sm' | 'md' | 'lg'", defaultValue: "'md'", description: 'Sets the inherited Toggle size.' },
    { name: 'variant', type: "'primary' | 'secondary' | 'ghost' | 'destructive'", defaultValue: "'secondary'", description: 'Sets the inherited selected treatment.' },
    { name: 'disabled', type: 'boolean', defaultValue: 'false', description: 'Disables every child Toggle.' },
    { name: 'loopFocus', type: 'boolean', defaultValue: 'true', description: 'Wraps arrow focus at the first and last enabled Toggle.' },
    { name: 'as / asChild', type: 'ElementType / boolean', defaultValue: '— / false', description: 'Changes the group root without adding a wrapper.' },
    { name: 'class / style', type: 'value | state function', defaultValue: '—', description: 'Styles disabled, type, orientation, layout, size, and variant state.' },
  ],
  examples: [
    {
      title: 'Single selection',
      description: 'One value is selected at a time, and selecting it again clears the group.',
      component: SingleSelectionExample,
      code: `<ToggleGroup aria-label="Text alignment" defaultValue="left">\n  <Toggle value="left" label="Left">Left</Toggle>\n  <Toggle value="center" label="Center">Center</Toggle>\n  <Toggle value="right" label="Right">Right</Toggle>\n</ToggleGroup>`,
    },
    {
      title: 'Multiple selection',
      description: 'Multiple mode preserves selected item order and prevents duplicate values.',
      component: MultipleSelectionExample,
      code: `<ToggleGroup\n  aria-label="Text formatting"\n  type="multiple"\n  defaultValue={['bold', 'italic']}\n>\n  <Toggle value="bold" label="Bold">Bold</Toggle>\n  <Toggle value="italic" label="Italic">Italic</Toggle>\n  <Toggle value="underline" label="Underline">Underline</Toggle>\n</ToggleGroup>`,
    },
    {
      title: 'Fill layout',
      description: 'Fill gives each direct Toggle equal width across the group.',
      component: FillLayoutExample,
      code: `<ToggleGroup\n  aria-label="View"\n  defaultValue="list"\n  layout="fill"\n>\n  <Toggle value="list" label="List">List</Toggle>\n  <Toggle value="board" label="Board">Board</Toggle>\n  <Toggle value="timeline" label="Timeline">Timeline</Toggle>\n</ToggleGroup>`,
    },
    {
      title: 'Vertical orientation',
      description: 'Vertical orientation uses Up and Down Arrow and connects block edges.',
      component: VerticalLayoutExample,
      code: `<ToggleGroup\n  aria-label="Dock position"\n  defaultValue="left"\n  orientation="vertical"\n>\n  <Toggle value="left" label="Left">Left</Toggle>\n  <Toggle value="right" label="Right">Right</Toggle>\n</ToggleGroup>`,
    },
  ],
};
