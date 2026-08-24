/* eslint-disable wheel/require-view-root -- Isolated catalog fixtures render library parts and icons; the catalog owns their inspection boundary. */
import { Avatar } from 'wheel/components';

// Wheel supplies the component recipe classes.
export default function ExampleAvatar() {
  return (
    <div style={{ display: 'flex', gap: '1rem' }}>
      <Avatar.Root>
        <Avatar.Image
          src="https://images.unsplash.com/photo-1543610892-0b1f7e6d8ac1?w=128&h=128&dpr=2&q=80"
          width="48"
          height="48"
        />
        <Avatar.Fallback delay={600}>
          LT
        </Avatar.Fallback>
      </Avatar.Root>
      <Avatar.Root>LT</Avatar.Root>
    </div>
  );
}
