/* eslint-disable wheel/require-view-root -- ComponentReferencePage owns these nested examples. */
import { Button } from 'wheel/components';
import { systemDefer } from 'wheel/core';

import type { ComponentReferenceDefinition } from './component-reference';
import { ChevronIcon, PlusIcon, TrashIcon } from './component-demos/button-icons';

function waitForSave() {
  return new Promise<void>((resolve) => {
    systemDefer.schedule(350, resolve);
  });
}

function PriorityExample() {
  return (
    <div class="button-reference-example-row">
      <Button variant="primary">Save changes</Button>
      <Button>Cancel</Button>
    </div>
  );
}

function ContentExample() {
  return (
    <div class="button-reference-example-row">
      <Button icon={<PlusIcon />}>New project</Button>
      <Button endContent={<ChevronIcon />}>Export</Button>
    </div>
  );
}

function AsyncExample() {
  return (
    <Button variant="primary" clickAction={waitForSave}>Save</Button>
  );
}

function DestructiveExample() {
  return (
    <div class="button-reference-example-row">
      <Button variant="destructive" icon={<TrashIcon />}>Delete project</Button>
      <Button>Keep project</Button>
    </div>
  );
}

export const BUTTON_REFERENCE: ComponentReferenceDefinition = {
  usageCode: `import { Button } from 'wheel/components/button';

<Button variant="primary" clickAction={saveProject}>
  Save project
</Button>`,
  props: [
    { name: 'children', type: 'JSX.Element', defaultValue: '—', description: 'Visible action label and content.' },
    { name: 'variant', type: "'primary' | 'secondary' | 'ghost' | 'destructive'", defaultValue: "'secondary'", description: 'Sets visual priority and intent.' },
    { name: 'size', type: "'sm' | 'md' | 'lg'", defaultValue: "'md'", description: 'Sets the dense control height and spacing.' },
    { name: 'disabled', type: 'boolean', defaultValue: 'false', description: 'Blocks pointer and keyboard activation.' },
    { name: 'focusableWhenDisabled', type: 'boolean', defaultValue: 'false', description: 'Keeps a disabled control in the tab order while blocking activation.' },
    { name: 'loading', type: 'boolean', defaultValue: 'false', description: 'Shows pending state and blocks activation.' },
    { name: 'interruptible', type: 'boolean', defaultValue: 'false', description: 'Allows another clickAction while earlier work remains pending.' },
    { name: 'clickAction', type: '(event) => void | Promise<void>', defaultValue: '—', description: 'Runs after onClick unless onClick prevents the default action.' },
    { name: 'onClick', type: 'MouseEvent handler', defaultValue: '—', description: 'Runs before clickAction and can prevent that action.' },
    { name: 'icon', type: 'JSX.Element', defaultValue: '—', description: 'Renders before the label.' },
    { name: 'endContent', type: 'JSX.Element', defaultValue: '—', description: 'Renders after the label.' },
    { name: 'href', type: 'string', defaultValue: '—', description: 'Renders an anchor and supplies its destination.' },
    { name: 'target / rel', type: 'string', defaultValue: '—', description: 'Sets the native anchor browsing context and relationship tokens.' },
    { name: 'download', type: 'string | boolean', defaultValue: '—', description: 'Sets native anchor download behavior.' },
    { name: 'type', type: "'button' | 'submit' | 'reset'", defaultValue: "'button'", description: 'Sets native form behavior.' },
    { name: 'name / value / form', type: 'native button props', defaultValue: '—', description: 'Passes native form submission data and ownership through.' },
    { name: 'nativeButton', type: 'boolean', defaultValue: 'true', description: 'Adds button semantics when a custom rendered element is not a button.' },
    { name: 'as / asChild', type: 'ElementType / boolean', defaultValue: '— / false', description: 'Changes the rendered element without adding a wrapper.' },
    { name: 'class / style', type: 'value | state function', defaultValue: '—', description: 'Adds styles from the resolved disabled, loading, variant, and size state.' },
  ],
  examples: [
    {
      title: 'Primary and supporting actions',
      description: 'Give the main action one clear priority. Keep the alternative neutral.',
      component: PriorityExample,
      code: `<div class="actions">\n  <Button variant="primary">Save changes</Button>\n  <Button>Cancel</Button>\n</div>`,
    },
    {
      title: 'Leading and trailing content',
      description: 'Use icons and end content to add meaning without replacing the label.',
      component: ContentExample,
      code: `<Button icon={<PlusIcon />}>New project</Button>\n<Button endContent={<ChevronIcon />}>Export</Button>`,
    },
    {
      title: 'Async action',
      description: 'Return the promise. Button owns the loading state until that promise settles.',
      component: AsyncExample,
      code: `<Button\n  variant="primary"\n  clickAction={async () => {\n    await saveProject();\n  }}\n>\n  Save\n</Button>`,
    },
    {
      title: 'Destructive confirmation',
      description: 'Use destructive emphasis only after the action and its effect are clear.',
      component: DestructiveExample,
      code: `<Button variant="destructive" icon={<TrashIcon />}>\n  Delete project\n</Button>\n<Button>Keep project</Button>`,
    },
  ],
};
