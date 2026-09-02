/* eslint-disable wheel/require-component-role -- The catalog demonstrates the components themselves: every fixture here IS a Button or a Dialog, so a role would name the catalog rather than tell two instances of one app apart. */
/* eslint-disable wheel/require-view-root -- Isolated catalog fixtures render library parts and icons; the catalog owns their inspection boundary. */
import { createUniqueId, For } from 'solid-js';
import { OTPField } from 'wheel/components';

const OTP_LENGTH = 6;

// Wheel supplies the component recipe classes.
export default function ExampleOTPField() {
  const id = createUniqueId();
  const descriptionId = `${id}-description`;

  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', gap: '0.5rem' }}>
      <label for={id}>Verification code</label>
      <OTPField.Root
        id={id}
        length={OTP_LENGTH}
        aria-describedby={descriptionId}
      >
        <For each={Array.from({ length: OTP_LENGTH }, (_, index) => index)}>
          {(index) => (
            <OTPField.Input
              aria-label={index === 0 ? undefined : `Character ${index + 1} of ${OTP_LENGTH}`}
            />
          )}
        </For>
      </OTPField.Root>
      <p id={descriptionId} style={{ margin: 0, color: 'var(--wheel-component-fg-muted)', 'font-size': 'var(--wheel-component-text-sm)' }}>
        Enter the 6-character code we sent to your device.
      </p>
    </div>
  );
}
