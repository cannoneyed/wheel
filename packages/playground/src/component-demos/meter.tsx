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
