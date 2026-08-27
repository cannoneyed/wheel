import { viewRoot } from 'wheel/core';
import { Avatar, type AvatarShape, type AvatarSize } from 'wheel/components';

import { DemoGroup } from './demo-group';

function InitialsAvatar(props: {
  readonly initials: string;
  readonly size?: AvatarSize | undefined;
  readonly shape?: AvatarShape | undefined;
}) {
  return (
    <Avatar.Root size={props.size} shape={props.shape} aria-label={`${props.initials} profile`}>
      <Avatar.Fallback>{props.initials}</Avatar.Fallback>
    </Avatar.Root>
  );
}

export default function ExampleAvatar() {
  return (
    <div use:viewRoot={'ExampleAvatar'} class="avatar-family-fixture">
      <DemoGroup title="Sizes">
        <InitialsAvatar initials="XS" size="xs" />
        <InitialsAvatar initials="SM" size="sm" />
        <InitialsAvatar initials="MD" size="md" />
        <InitialsAvatar initials="LG" size="lg" />
        <InitialsAvatar initials="XL" size="xl" />
      </DemoGroup>

      <DemoGroup title="Shapes">
        <InitialsAvatar initials="AC" shape="circle" />
        <InitialsAvatar initials="AC" shape="rounded" />
        <InitialsAvatar initials="AC" shape="square" />
      </DemoGroup>
    </div>
  );
}
