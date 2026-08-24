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
