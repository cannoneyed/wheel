/* eslint-disable wheel/require-component-role -- The catalog demonstrates the components themselves: every fixture here IS a Button or a Dialog, so a role would name the catalog rather than tell two instances of one app apart. */
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
