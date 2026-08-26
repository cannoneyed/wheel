import { Button, ButtonGroup, IconButton } from 'wheel/components';

import { MoreIcon, PlusIcon, TrashIcon } from './component-demos/button-icons';
import type { ComponentReferenceDefinition } from './component-reference';

function EditingActionsExample() {
  return (
    <ButtonGroup aria-label="Editing actions">
      <Button>Copy</Button>
      <Button>Cut</Button>
      <Button>Paste</Button>
    </ButtonGroup>
  );
}

function SplitActionExample() {
  return (
    <ButtonGroup aria-label="Create actions" variant="primary">
      <Button icon={<PlusIcon />}>Create</Button>
      <IconButton label="More create options" icon={<MoreIcon />} />
    </ButtonGroup>
  );
}

function VerticalActionsExample() {
  return (
    <ButtonGroup aria-label="Move item" orientation="vertical">
      <Button>Move up</Button>
      <Button>Move down</Button>
    </ButtonGroup>
  );
}

function DestructiveActionsExample() {
  return (
    <ButtonGroup aria-label="Delete actions" variant="destructive">
      <Button icon={<TrashIcon />}>Delete</Button>
      <IconButton label="More delete options" icon={<MoreIcon />} />
    </ButtonGroup>
  );
}

export const BUTTON_GROUP_REFERENCE: ComponentReferenceDefinition = {
  usageCode: `import { Button, ButtonGroup } from 'wheel/components';

<ButtonGroup aria-label="Editing actions">
  <Button>Copy</Button>
  <Button>Cut</Button>
  <Button>Paste</Button>
</ButtonGroup>`,
  props: [
    { name: 'children', type: 'Button | IconButton', defaultValue: '—', description: 'Direct action members rendered in group order.' },
    { name: 'aria-label / aria-labelledby', type: 'string', defaultValue: '—', description: 'Names the group for assistive technology.' },
    { name: 'orientation', type: "'horizontal' | 'vertical'", defaultValue: "'horizontal'", description: 'Sets connected edges and arrow-key direction.' },
    { name: 'size', type: "'sm' | 'md' | 'lg'", defaultValue: "'md'", description: 'Sets the inherited member size.' },
    { name: 'variant', type: "'primary' | 'secondary' | 'ghost' | 'destructive'", defaultValue: "'secondary'", description: 'Sets the inherited member treatment.' },
    { name: 'disabled', type: 'boolean', defaultValue: 'false', description: 'Disables every member without changing labels or order.' },
    { name: 'loopFocus', type: 'boolean', defaultValue: 'true', description: 'Wraps arrow focus from the last enabled member to the first.' },
    { name: 'as / asChild', type: 'ElementType / boolean', defaultValue: '— / false', description: 'Changes the group root without adding a wrapper.' },
    { name: 'class / style', type: 'value | state function', defaultValue: '—', description: 'Styles the resolved disabled, orientation, size, and variant state.' },
  ],
  examples: [
    {
      title: 'Related editing actions',
      description: 'One group keeps adjacent actions compact and provides one Tab stop.',
      component: EditingActionsExample,
      code: `<ButtonGroup aria-label="Editing actions">\n  <Button>Copy</Button>\n  <Button>Cut</Button>\n  <Button>Paste</Button>\n</ButtonGroup>`,
    },
    {
      title: 'Split action',
      description: 'Pair a labeled default action with a named icon action.',
      component: SplitActionExample,
      code: `<ButtonGroup aria-label="Create actions" variant="primary">\n  <Button icon={<PlusIcon />}>Create</Button>\n  <IconButton label="More create options" icon={<MoreIcon />} />\n</ButtonGroup>`,
    },
    {
      title: 'Vertical actions',
      description: 'Vertical orientation connects block edges and uses Up and Down Arrow.',
      component: VerticalActionsExample,
      code: `<ButtonGroup aria-label="Move item" orientation="vertical">\n  <Button>Move up</Button>\n  <Button>Move down</Button>\n</ButtonGroup>`,
    },
    {
      title: 'Destructive actions',
      description: 'A destructive group keeps related delete actions at the same intent level.',
      component: DestructiveActionsExample,
      code: `<ButtonGroup aria-label="Delete actions" variant="destructive">\n  <Button icon={<TrashIcon />}>Delete</Button>\n  <IconButton label="More delete options" icon={<MoreIcon />} />\n</ButtonGroup>`,
    },
  ],
};
