/* eslint-disable wheel/require-component-role -- The catalog demonstrates the components themselves: every fixture here IS a Button or a Dialog, so a role would name the catalog rather than tell two instances of one app apart. */
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
