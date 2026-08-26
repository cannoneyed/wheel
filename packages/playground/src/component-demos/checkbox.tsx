/* eslint-disable wheel/require-view-root -- The catalog owns this fixture composition boundary. */
import { CheckboxControl } from './checkbox-parts';
import { DemoGroup } from './demo-group';

export default function ExampleCheckbox() {
  return (
    <div class="checkbox-family-fixture checkbox-family-fixture--documented">
      <DemoGroup title="Values" description="Boolean and mixed values use one stable control size.">
        <CheckboxControl label="Unchecked" />
        <CheckboxControl label="Checked" defaultChecked data-testid="focus-checkbox" />
        <CheckboxControl label="Indeterminate" indeterminate />
      </DemoGroup>

      <DemoGroup title="Sizes" description="Small and medium fit dense application rows.">
        <CheckboxControl label="Small" size="sm" />
        <CheckboxControl label="Medium" size="md" defaultChecked />
      </DemoGroup>

      <DemoGroup title="Validation status">
        <CheckboxControl label="Success" status="success" defaultChecked />
        <CheckboxControl label="Warning" status="warning" defaultChecked />
        <CheckboxControl label="Error" status="error" defaultChecked />
      </DemoGroup>

      <DemoGroup title="Constraints">
        <CheckboxControl label="Disabled" disabled />
        <CheckboxControl label="Read only" readOnly defaultChecked />
        <CheckboxControl label="Required" required />
      </DemoGroup>
    </div>
  );
}
