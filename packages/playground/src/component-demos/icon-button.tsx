/* eslint-disable wheel/require-component-role -- The catalog demonstrates the components themselves: every fixture here IS a Button or a Dialog, so a role would name the catalog rather than tell two instances of one app apart. */
import { viewRoot } from 'wheel/core';
import { For } from 'solid-js';
import { IconButton, type ButtonSize, type ButtonVariant } from 'wheel/components';
import { MoreIcon, PlusIcon, TrashIcon } from './button-icons';
import { DemoGroup } from './demo-group';

const variants: readonly ButtonVariant[] = ['primary', 'secondary', 'ghost', 'destructive'];
const sizes: readonly ButtonSize[] = ['sm', 'md', 'lg'];

export default function ExampleIconButton() {
  return (
    <div use:viewRoot={'ExampleIconButton'} class="button-family-fixture button-family-fixture--documented">
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
