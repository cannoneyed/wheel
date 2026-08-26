/* eslint-disable wheel/require-view-root -- The catalog owns this fixture composition boundary. */
import { CheckboxListItem } from 'wheel/components';
import { DemoGroup } from './demo-group';

export default function ExampleCheckboxListItem() {
  return (
    <div class="checkbox-family-fixture checkbox-family-fixture--documented">
      <DemoGroup title="Content">
        <div class="checkbox-list-item-stage">
          <CheckboxListItem label="Label only" />
          <CheckboxListItem
            label="With description"
            description="Supporting text wraps below the label"
          />
          <CheckboxListItem
            label="With metadata"
            description="Passive end content stays aligned"
            endContent="12 items"
          />
        </div>
      </DemoGroup>

      <DemoGroup title="Values and constraints">
        <div class="checkbox-list-item-stage">
          <CheckboxListItem
            label="Checked"
            defaultChecked
            data-testid="checkbox-list-item-focus"
          />
          <CheckboxListItem label="Indeterminate" indeterminate />
          <CheckboxListItem label="Disabled" disabled />
          <CheckboxListItem label="Read only" readOnly defaultChecked />
        </div>
      </DemoGroup>

      <DemoGroup title="Sizes and status">
        <div class="checkbox-list-item-stage">
          <CheckboxListItem
            label="Small success"
            size="sm"
            status="success"
            defaultChecked
          />
          <CheckboxListItem
            label="Medium warning"
            size="md"
            status="warning"
            defaultChecked
          />
          <CheckboxListItem label="Error" status="error" />
        </div>
      </DemoGroup>
    </div>
  );
}
