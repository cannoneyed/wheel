/* eslint-disable wheel/require-view-root -- The catalog owns this fixture's inspection boundary. */
import { Button, ButtonGroup, IconButton } from 'wheel/components';
import { DirectionProvider } from 'wheel/components/direction-provider';
import { MoreIcon, PlusIcon, TrashIcon } from './button-icons';
import { DemoGroup } from './demo-group';

export default function ExampleButtonGroup() {
  return (
    <div class="button-family-fixture button-family-fixture--documented">
      <DemoGroup title="Common groups">
        <ButtonGroup aria-label="Editing actions" data-testid="button-group-horizontal">
          <Button>Copy</Button>
          <Button>Cut</Button>
          <Button>Paste</Button>
        </ButtonGroup>

        <ButtonGroup aria-label="Create actions" size="sm" variant="primary">
          <Button icon={<PlusIcon />}>Create</Button>
          <IconButton label="More create options" icon={<MoreIcon />} />
        </ButtonGroup>
      </DemoGroup>

      <DemoGroup title="Intent and navigation">
        <ButtonGroup aria-label="Delete actions" size="lg" variant="destructive">
          <Button icon={<TrashIcon />}>Delete</Button>
          <IconButton label="More delete options" icon={<MoreIcon />} />
        </ButtonGroup>

        <ButtonGroup aria-label="Navigation actions" variant="ghost">
          <Button href="#previous">Previous</Button>
          <Button href="#next">Next</Button>
        </ButtonGroup>
      </DemoGroup>

      <DemoGroup title="Orientation and states">
        <ButtonGroup
          aria-label="Vertical actions"
          orientation="vertical"
          data-testid="button-group-vertical"
        >
          <Button>Move up</Button>
          <Button>Move down</Button>
        </ButtonGroup>

        <ButtonGroup aria-label="Unavailable actions" disabled>
          <Button>Archive</Button>
          <IconButton label="More unavailable actions" icon={<MoreIcon />} />
        </ButtonGroup>

        <ButtonGroup aria-label="Pending actions" size="sm">
          <Button loading>Saving</Button>
          <Button>Cancel</Button>
        </ButtonGroup>
      </DemoGroup>

      <DemoGroup title="Right-to-left direction">
        <div dir="rtl">
          <DirectionProvider direction="rtl">
            <ButtonGroup aria-label="Right-to-left actions" data-testid="button-group-rtl">
              <Button>First</Button>
              <Button>Second</Button>
            </ButtonGroup>
          </DirectionProvider>
        </div>
      </DemoGroup>
    </div>
  );
}
