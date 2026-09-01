/* eslint-disable wheel/require-component-role -- The catalog demonstrates the components themselves: every fixture here IS a Button or a Dialog, so a role would name the catalog rather than tell two instances of one app apart. */
/* eslint-disable wheel/require-view-root -- ComponentReferencePage owns these nested examples. */
import { Toggle } from 'wheel/components';
import { useSignal } from 'wheel/core';

import { StarFilledIcon, StarIcon } from './component-demos/button-icons';
import type { ComponentReferenceDefinition } from './component-reference';

function LabeledToggleExample() {
  return <Toggle label="Show grid" defaultPressed>Show grid</Toggle>;
}

function IconToggleExample() {
  return (
    <Toggle label="Favorite" icon={<StarIcon />} pressedIcon={<StarFilledIcon />} />
  );
}

function ControlledToggleExample() {
  const [pressed, setPressed] = useSignal(false, 'controlledTogglePressed');
  return (
    <div class="button-reference-example-row">
      <Toggle
        label="Preview"
        pressed={pressed()}
        onPressedChange={(nextPressed) => setPressed(nextPressed)}
      >
        Preview
      </Toggle>
      <output>{pressed() ? 'Preview on' : 'Preview off'}</output>
    </div>
  );
}

function IconOnlyToggleExample() {
  return <Toggle label="Favorite" icon={<StarIcon />} pressedIcon={<StarFilledIcon />} />;
}

export const TOGGLE_REFERENCE: ComponentReferenceDefinition = {
  usageCode: `import { Toggle } from 'wheel/components';

<Toggle label="Show grid" defaultPressed>
  Show grid
</Toggle>`,
  props: [
    { name: 'pressed', type: 'boolean', defaultValue: '—', description: 'Controls pressed state.' },
    { name: 'defaultPressed', type: 'boolean', defaultValue: 'false', description: 'Sets initial uncontrolled pressed state.' },
    { name: 'onPressedChange', type: '(pressed, details) => void', defaultValue: '—', description: 'Requests a state change before it commits; canceling details keeps the current state.' },
    { name: 'value', type: 'string', defaultValue: 'generated', description: 'Identifies the Toggle inside ToggleGroup.' },
    { name: 'label', type: 'string', defaultValue: '—', description: 'Supplies visible text or the icon-only accessible name.' },
    { name: 'children', type: 'JSX.Element', defaultValue: 'label', description: 'Supplies visible content when present.' },
    { name: 'icon', type: 'JSX.Element', defaultValue: '—', description: 'Renders before visible text.' },
    { name: 'pressedIcon', type: 'JSX.Element', defaultValue: 'icon', description: 'Replaces icon while pressed.' },
    { name: 'variant', type: "'primary' | 'secondary' | 'ghost' | 'destructive'", defaultValue: "'ghost'", description: 'Sets the selected treatment.' },
    { name: 'size', type: "'sm' | 'md' | 'lg'", defaultValue: "'md'", description: 'Sets the dense control size.' },
    { name: 'disabled', type: 'boolean', defaultValue: 'false', description: 'Blocks pointer and keyboard state changes.' },
    { name: 'nativeButton', type: 'boolean', defaultValue: 'true', description: 'Adds button semantics when a custom rendered element is not a button.' },
    { name: 'as / asChild', type: 'ElementType / boolean', defaultValue: '— / false', description: 'Changes the rendered element without adding a wrapper.' },
    { name: 'class / style', type: 'value | state function', defaultValue: '—', description: 'Styles pressed, disabled, variant, size, and icon-only state.' },
  ],
  examples: [
    {
      title: 'Labeled toggle',
      description: 'Visible text names a temporary view or tool state.',
      component: LabeledToggleExample,
      code: `<Toggle label="Show grid" defaultPressed>\n  Show grid\n</Toggle>`,
    },
    {
      title: 'Pressed icon swap',
      description: 'The icon changes with state while the accessible label stays fixed.',
      component: IconToggleExample,
      code: `<Toggle\n  label="Favorite"\n  icon={<StarIcon />}\n  pressedIcon={<StarFilledIcon />}\n/>`,
    },
    {
      title: 'Controlled state',
      description: 'The owner commits each requested state change through pressed.',
      component: ControlledToggleExample,
      code: `<Toggle\n  label="Preview"\n  pressed={preview()}\n  onPressedChange={setPreview}\n>\n  Preview\n</Toggle>`,
    },
    {
      title: 'Icon-only toggle',
      description: 'Omitting children keeps the control square and promotes label to aria-label.',
      component: IconOnlyToggleExample,
      code: `<Toggle\n  label="Favorite"\n  icon={<StarIcon />}\n  pressedIcon={<StarFilledIcon />}\n/>`,
    },
  ],
};
