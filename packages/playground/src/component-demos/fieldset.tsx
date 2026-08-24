import { Field, Fieldset } from 'wheel/components';

// Wheel supplies the component recipe classes.
export default function ExampleField() {
  return (
    <Fieldset.Root style={{ width: '100%', 'max-width': '16rem' }}>
      <Fieldset.Legend>Billing details</Fieldset.Legend>

      <Field.Root>
        <Field.Label>Company</Field.Label>
        <Field.Control placeholder="Enter company name" />
      </Field.Root>

      <Field.Root>
        <Field.Label>Tax ID</Field.Label>
        <Field.Control placeholder="Enter fiscal number" />
      </Field.Root>
    </Fieldset.Root>
  );
}
