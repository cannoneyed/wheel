import { viewRoot } from 'wheel/core';
import { For } from 'solid-js';
import { Toggle, type ButtonSize, type ButtonVariant } from 'wheel/components';
import { StarFilledIcon, StarIcon } from './button-icons';
import { DemoGroup } from './demo-group';

const variants: readonly ButtonVariant[] = ['primary', 'secondary', 'ghost', 'destructive'];
const sizes: readonly ButtonSize[] = ['sm', 'md', 'lg'];

export default function ExampleToggle() {
  return (
    <div use:viewRoot={'ExampleToggle'} class="button-family-fixture button-family-fixture--documented">
      <DemoGroup title="Variants">
        <For each={variants}>
          {(variant) => <Toggle label={variant} variant={variant} defaultPressed />}
        </For>
      </DemoGroup>

      <DemoGroup title="Sizes and content">
        <For each={sizes}>
          {(size) => (
            <Toggle
              label={`${size} favorite`}
              icon={<StarIcon />}
              pressedIcon={<StarFilledIcon />}
              size={size}
              defaultPressed={size === 'md'}
            />
          )}
        </For>
        <Toggle icon={<StarIcon />} pressedIcon={<StarFilledIcon />} label="Favorite">
          Favorite
        </Toggle>
        <Toggle label="Disabled favorite" icon={<StarIcon />} disabled />
      </DemoGroup>
    </div>
  );
}
