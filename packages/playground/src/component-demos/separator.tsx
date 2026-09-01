/* eslint-disable wheel/require-component-role -- The catalog demonstrates the components themselves: every fixture here IS a Button or a Dialog, so a role would name the catalog rather than tell two instances of one app apart. */
import { viewRoot } from 'wheel/core';
import { Button, Separator } from 'wheel/components';

// Wheel supplies the component recipe classes.
export default function ExampleSeparator() {
  return (
    <div use:viewRoot={'ExampleSeparator'} style={{ display: 'flex', gap: '1rem', 'text-wrap': 'nowrap' }}>
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
