import type { ComponentReferenceDefinition } from './component-reference';
import { BUTTON_GROUP_REFERENCE } from './button-group-reference';
import { BUTTON_REFERENCE } from './button-reference';
import { CHECKBOX_GROUP_REFERENCE } from './checkbox-group-reference';
import { CHECKBOX_LIST_ITEM_REFERENCE } from './checkbox-list-item-reference';
import { CHECKBOX_LIST_REFERENCE } from './checkbox-list-reference';
import { CHECKBOX_REFERENCE } from './checkbox-reference';
import { CODE_BLOCK_REFERENCE } from './code-block-reference';
import { ICON_BUTTON_REFERENCE } from './icon-button-reference';
import { CURRENT_COMPONENT_REFERENCES } from './current-component-references';
import { ASTRYX_COMPONENT_REFERENCES } from './astryx-component-references';
import { SELECT_REFERENCE } from './select-reference';
import { TOGGLE_GROUP_REFERENCE } from './toggle-group-reference';
import { TOGGLE_REFERENCE } from './toggle-reference';

export const COMPONENT_REFERENCES: Readonly<Record<string, ComponentReferenceDefinition>> = {
  ...CURRENT_COMPONENT_REFERENCES,
  ...ASTRYX_COMPONENT_REFERENCES,
  button: BUTTON_REFERENCE,
  'button-group': BUTTON_GROUP_REFERENCE,
  checkbox: CHECKBOX_REFERENCE,
  'checkbox-group': CHECKBOX_GROUP_REFERENCE,
  'checkbox-list': CHECKBOX_LIST_REFERENCE,
  'checkbox-list-item': CHECKBOX_LIST_ITEM_REFERENCE,
  'code-block': CODE_BLOCK_REFERENCE,
  'icon-button': ICON_BUTTON_REFERENCE,
  select: SELECT_REFERENCE,
  toggle: TOGGLE_REFERENCE,
  'toggle-group': TOGGLE_GROUP_REFERENCE,
};
