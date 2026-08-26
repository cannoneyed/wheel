/* eslint-disable wheel/require-view-root -- The catalog owns this fixture composition boundary. */
import { Avatar, type AvatarShape, type AvatarSize, type AvatarStatus } from 'wheel/components';

import { DemoGroup } from './demo-group';

function InitialsAvatar(props: {
  readonly initials: string;
  readonly size?: AvatarSize | undefined;
  readonly shape?: AvatarShape | undefined;
  readonly status?: AvatarStatus | undefined;
}) {
  return (
    <Avatar.Root size={props.size} shape={props.shape} status={props.status} aria-label={`${props.initials} profile`}>
      <Avatar.Fallback>{props.initials}</Avatar.Fallback>
    </Avatar.Root>
  );
}

export default function ExampleAvatar() {
  return (
    <div class="avatar-family-fixture">
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

      <DemoGroup title="Availability">
        <InitialsAvatar initials="ON" status="online" />
        <InitialsAvatar initials="BZ" status="busy" />
        <InitialsAvatar initials="AW" status="away" />
        <InitialsAvatar initials="OF" status="offline" />
      </DemoGroup>
    </div>
  );
}
