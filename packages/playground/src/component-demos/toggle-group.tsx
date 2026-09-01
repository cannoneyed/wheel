/* eslint-disable wheel/require-component-role -- The catalog demonstrates the components themselves: every fixture here IS a Button or a Dialog, so a role would name the catalog rather than tell two instances of one app apart. */
import { viewRoot } from 'wheel/core';
import { Toggle, ToggleGroup } from 'wheel/components';
import { DirectionProvider } from 'wheel/components/direction-provider';
import { AlignCenterIcon, AlignLeftIcon, AlignRightIcon } from './button-icons';
import { DemoGroup } from './demo-group';

function AlignmentToggles() {
  return (
    <>
      <Toggle label="Align left" value="left" icon={<AlignLeftIcon />} />
      <Toggle label="Align center" value="center" icon={<AlignCenterIcon />} />
      <Toggle label="Align right" value="right" icon={<AlignRightIcon />} />
    </>
  );
}

export default function ExampleToggleGroup() {
  return (
    <div use:viewRoot={'ExampleToggleGroup'} class="button-family-fixture button-family-fixture--wide button-family-fixture--documented">
      <DemoGroup title="Selection modes">
        <ToggleGroup aria-label="Text alignment" defaultValue="left" data-testid="toggle-group-single">
          <AlignmentToggles />
        </ToggleGroup>

        <ToggleGroup
          aria-label="Text formatting"
          type="multiple"
          defaultValue={['bold', 'italic']}
          size="sm"
          variant="primary"
          data-testid="toggle-group-multiple"
        >
          <Toggle value="bold" label="Bold" />
          <Toggle value="italic" label="Italic" />
          <Toggle value="underline" label="Underline" />
        </ToggleGroup>
      </DemoGroup>

      <DemoGroup title="Layout and orientation">
        <ToggleGroup
          aria-label="Text alignment full width"
          defaultValue="center"
          size="lg"
          variant="ghost"
          layout="fill"
          data-testid="toggle-group-fill"
        >
          <AlignmentToggles />
        </ToggleGroup>

        <ToggleGroup
          aria-label="Vertical alignment"
          defaultValue="left"
          orientation="vertical"
          variant="destructive"
          data-testid="toggle-group-vertical"
        >
          <AlignmentToggles />
        </ToggleGroup>
      </DemoGroup>

      <DemoGroup title="Disabled and right-to-left">
        <ToggleGroup aria-label="Disabled alignment" defaultValue="left" disabled>
          <AlignmentToggles />
        </ToggleGroup>

        <div dir="rtl">
          <DirectionProvider direction="rtl">
            <ToggleGroup
              aria-label="Right-to-left alignment"
              defaultValue="first"
              data-testid="toggle-group-rtl"
            >
              <Toggle value="first" label="First" />
              <Toggle value="second" label="Second" />
            </ToggleGroup>
          </DirectionProvider>
        </div>
      </DemoGroup>
    </div>
  );
}
