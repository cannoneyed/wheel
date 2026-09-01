/* eslint-disable wheel/require-component-role -- The catalog demonstrates the components themselves: every fixture here IS a Button or a Dialog, so a role would name the catalog rather than tell two instances of one app apart. */
import { Button, ButtonGroup, IconButton } from 'wheel/components';

import { MoreIcon, PlusIcon, TrashIcon } from './component-demos/button-icons';
import type { ComponentReferenceDefinition } from './component-reference';

function CommonActionExample() {
  return <IconButton label="More actions" icon={<MoreIcon />} />;
}

function CreateActionExample() {
  return <IconButton label="Create project" icon={<PlusIcon />} variant="primary" />;
}

function DeleteActionExample() {
  return <IconButton label="Delete project" icon={<TrashIcon />} variant="destructive" />;
}

function GroupedActionExample() {
  return (
    <ButtonGroup aria-label="Create actions">
      <Button>Create</Button>
      <IconButton label="More create options" icon={<MoreIcon />} />
    </ButtonGroup>
  );
}

export const ICON_BUTTON_REFERENCE: ComponentReferenceDefinition = {
  usageCode: `import { IconButton } from 'wheel/components';

<IconButton
  label="More actions"
  icon={<MoreIcon />}
/>`,
  props: [
    { name: 'label', type: 'string', defaultValue: '—', description: 'Required accessible name for the action.' },
    { name: 'icon', type: 'JSX.Element', defaultValue: '—', description: 'Required visual icon rendered at the center.' },
    { name: 'variant', type: "'primary' | 'secondary' | 'ghost' | 'destructive'", defaultValue: "'secondary'", description: 'Sets visual priority and intent.' },
    { name: 'size', type: "'sm' | 'md' | 'lg'", defaultValue: "'md'", description: 'Sets equal width and height.' },
    { name: 'disabled', type: 'boolean', defaultValue: 'false', description: 'Blocks pointer and keyboard activation.' },
    { name: 'focusableWhenDisabled', type: 'boolean', defaultValue: 'false', description: 'Keeps a disabled action in the tab order.' },
    { name: 'loading', type: 'boolean', defaultValue: 'false', description: 'Shows pending state and blocks activation.' },
    { name: 'interruptible', type: 'boolean', defaultValue: 'false', description: 'Allows another clickAction while earlier work remains pending.' },
    { name: 'clickAction', type: '(event) => void | Promise<void>', defaultValue: '—', description: 'Runs action work and owns pending state for returned promises.' },
    { name: 'href', type: 'string', defaultValue: '—', description: 'Renders an anchor and supplies its destination.' },
    { name: 'target / rel / download', type: 'anchor props', defaultValue: '—', description: 'Passes native link behavior through.' },
    { name: 'type / name / value / form', type: 'button props', defaultValue: "'button' / —", description: 'Passes native form behavior through.' },
    { name: 'as', type: 'ElementType', defaultValue: '—', description: 'Changes the rendered element.' },
    { name: 'class / style', type: 'value | state function', defaultValue: '—', description: 'Styles the resolved Button state.' },
  ],
  examples: [
    {
      title: 'Common compact action',
      description: 'A familiar icon keeps a frequent action compact while label names it.',
      component: CommonActionExample,
      code: `<IconButton label="More actions" icon={<MoreIcon />} />`,
    },
    {
      title: 'Primary icon action',
      description: 'Primary emphasis is reserved for the main action in the view.',
      component: CreateActionExample,
      code: `<IconButton\n  label="Create project"\n  icon={<PlusIcon />}\n  variant="primary"\n/>`,
    },
    {
      title: 'Destructive icon action',
      description: 'The label states the destructive result even when the icon is familiar.',
      component: DeleteActionExample,
      code: `<IconButton\n  label="Delete project"\n  icon={<TrashIcon />}\n  variant="destructive"\n/>`,
    },
    {
      title: 'Grouped icon action',
      description: 'IconButton inherits size, variant, disabled state, and roving focus from ButtonGroup.',
      component: GroupedActionExample,
      code: `<ButtonGroup aria-label="Create actions">\n  <Button>Create</Button>\n  <IconButton label="More create options" icon={<MoreIcon />} />\n</ButtonGroup>`,
    },
  ],
};
