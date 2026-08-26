/* eslint-disable wheel/require-view-root -- Isolated catalog fixtures render library parts and icons; the catalog owns their inspection boundary. */
import { Button, Separator } from 'wheel/components';

// Wheel supplies the component recipe classes.
export default function ExampleSeparator() {
  return (
    <div style={{ display: 'flex', gap: '1rem', 'text-wrap': 'nowrap' }}>
      <Button href="#" size="sm" variant="ghost">Home</Button>
      <Button href="#" size="sm" variant="ghost">Pricing</Button>
      <Button href="#" size="sm" variant="ghost">Blog</Button>
      <Button href="#" size="sm" variant="ghost">Support</Button>

      <Separator orientation="vertical" />

      <Button href="#" size="sm" variant="ghost">Log in</Button>
      <Button href="#" size="sm" variant="ghost">Sign up</Button>
    </div>
  );
}
