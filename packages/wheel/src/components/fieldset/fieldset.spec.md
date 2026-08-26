# Fieldset behavior specification

- Fieldset groups related controls under one native legend.
- Root renders `fieldset` by default and Legend renders `legend` by default.
- The first Legend provides the accessible name for the group.
- Disabled Root uses native fieldset behavior so descendant controls stop interaction as one group.
- Disabled state does not hide labels, descriptions, selected values, or validation messages.
- Nested fieldsets retain their own legends and do not duplicate the outer accessible name.
- Horizontal and vertical layouts change only presentation, not grouping semantics.
- Compact, balanced, and spacious density use shared field gaps.
- A validation summary may describe the group and link to individual invalid controls.
- Required instructions apply to the group only when every member shares that requirement.
- Custom rendering must preserve `group` semantics and a programmatic name.
- Fieldset has no entry animation. Dynamic messages may use only the shared exit fade.
- Forced colors preserve the group boundary and legend. Long legends wrap without covering controls.
- Browser proof covers legend naming, disabled descendants, nested groups, form submission, and zoom.
