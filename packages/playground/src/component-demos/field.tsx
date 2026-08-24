import { Field } from 'wheel/components';

// Wheel supplies the component recipe classes.
export default function ExampleField() {
  return (
    <Field.Root style={{ width: '100%', 'max-width': '16rem' }}>
      <Field.Label>Name</Field.Label>
      <Field.Control required placeholder="Required" />

      <Field.Error match="valueMissing">
        Please enter your name
      </Field.Error>

      <Field.Description>Visible on your profile</Field.Description>
    </Field.Root>
  );
}
