/* eslint-disable wheel/require-component-role -- The catalog demonstrates the components themselves: every fixture here IS a Button or a Dialog, so a role would name the catalog rather than tell two instances of one app apart. */
import { Slider } from 'wheel/components';

// Wheel supplies the component recipe classes.
export default function ExampleSlider() {
  return (
    <Slider.Root defaultValue={25}>
      <Slider.Control>
        <Slider.Track>
          <Slider.Indicator />
          <Slider.Thumb aria-label="Volume" />
        </Slider.Track>
      </Slider.Control>
    </Slider.Root>
  );
}
