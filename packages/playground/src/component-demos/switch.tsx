/* eslint-disable wheel/require-view-root -- Isolated catalog fixtures render library parts and icons; the catalog owns their inspection boundary. */
import { Switch } from 'wheel/components';

// Wheel supplies the component recipe classes.
export default function ExampleSwitch() {
  return (
    <label style={{ display: 'flex', 'align-items': 'center', gap: '0.75rem' }}>
      <Switch.Root defaultChecked>
        <Switch.Thumb />
      </Switch.Root>
      Notifications
    </label>
  );
}
