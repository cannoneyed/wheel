/* eslint-disable wheel/require-view-root -- The catalog owns this fixture's inspection boundary. */
import { For } from 'solid-js';
import { IconButton, type ButtonSize, type ButtonVariant } from 'wheel/components';
import { MoreIcon, PlusIcon, TrashIcon } from './button-icons';
import { DemoGroup } from './demo-group';

const variants: readonly ButtonVariant[] = ['primary', 'secondary', 'ghost', 'destructive'];
const sizes: readonly ButtonSize[] = ['sm', 'md', 'lg'];

export default function ExampleIconButton() {
  return (
    <div class="button-family-fixture button-family-fixture--documented">
      <DemoGroup title="Variants">
        <For each={variants}>
          {(variant) => (
            <IconButton label={`${variant} action`} icon={<MoreIcon />} variant={variant} />
          )}
        </For>
      </DemoGroup>

      <DemoGroup title="Sizes and states">
        <For each={sizes}>
          {(size) => <IconButton label={`${size} create`} icon={<PlusIcon />} size={size} />}
        </For>
        <IconButton label="Delete" icon={<TrashIcon />} disabled />
        <IconButton label="Loading action" icon={<MoreIcon />} loading />
        <IconButton label="Open details" icon={<MoreIcon />} href="#details" />
      </DemoGroup>
    </div>
  );
}
