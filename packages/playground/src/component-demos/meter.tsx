/* eslint-disable wheel/require-component-role -- The catalog demonstrates the components themselves: every fixture here IS a Button or a Dialog, so a role would name the catalog rather than tell two instances of one app apart. */
import { Meter } from 'wheel/components';

// Wheel supplies the component recipe classes.
export default function ExampleMeter() {
  return (
    <Meter.Root value={24}>
      <Meter.Label>Storage Used</Meter.Label>
      <Meter.Value />
      <Meter.Track>
        <Meter.Indicator />
      </Meter.Track>
    </Meter.Root>
  );
}
