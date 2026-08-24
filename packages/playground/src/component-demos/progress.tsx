import { Progress } from 'wheel/components';

// Wheel supplies the component recipe classes.
export default function ExampleProgress() {
  return (
    <Progress.Root value={20}>
      <Progress.Label>Export data</Progress.Label>
      <Progress.Value />
      <Progress.Track>
        <Progress.Indicator />
      </Progress.Track>
    </Progress.Root>
  );
}
