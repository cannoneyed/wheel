import type { JSX } from 'solid-js';

import AccordionDemo from './component-demos/accordion';
import AlertDialogDemo from './component-demos/alert-dialog';
import AutocompleteDemo from './component-demos/autocomplete';
import AvatarDemo from './component-demos/avatar';
import ButtonDemo from './component-demos/button';
import ButtonGroupDemo from './component-demos/button-group';
import CheckboxDemo from './component-demos/checkbox';
import CheckboxGroupDemo from './component-demos/checkbox-group';
import CheckboxListDemo from './component-demos/checkbox-list';
import CheckboxListItemDemo from './component-demos/checkbox-list-item';
import CodeBlockDemo from './component-demos/code-block';
import CollapsibleDemo from './component-demos/collapsible';
import ComboboxDemo from './component-demos/combobox';
import ContextMenuDemo from './component-demos/context-menu';
import DialogDemo from './component-demos/dialog';
import DrawerDemo from './component-demos/drawer';
import FieldDemo from './component-demos/field';
import FieldsetDemo from './component-demos/fieldset';
import FormDemo from './component-demos/form';
import InputDemo from './component-demos/input';
import IconButtonDemo from './component-demos/icon-button';
import MenuDemo from './component-demos/menu';
import MenubarDemo from './component-demos/menubar';
import MeterDemo from './component-demos/meter';
import NavigationMenuDemo from './component-demos/navigation-menu';
import NumberFieldDemo from './component-demos/number-field';
import OTPFieldDemo from './component-demos/otp-field';
import PopoverDemo from './component-demos/popover';
import PreviewCardDemo from './component-demos/preview-card';
import ProgressDemo from './component-demos/progress';
import RadioDemo from './component-demos/radio';
import RadioGroupDemo from './component-demos/radio-group';
import ScrollAreaDemo from './component-demos/scroll-area';
import SelectDemo from './component-demos/select';
import SeparatorDemo from './component-demos/separator';
import SliderDemo from './component-demos/slider';
import SwitchDemo from './component-demos/switch';
import TabsDemo from './component-demos/tabs';
import ToastDemo from './component-demos/toast';
import ToggleDemo from './component-demos/toggle';
import ToggleGroupDemo from './component-demos/toggle-group';
import ToolbarDemo from './component-demos/toolbar';
import TooltipDemo from './component-demos/tooltip';
import { ASTRYX_COMPONENT_FIXTURES } from './astryx-component-fixtures';

export type ComponentGroup =
  | 'Actions'
  | 'Forms'
  | 'Content'
  | 'Data display'
  | 'Feedback'
  | 'Layout'
  | 'Navigation'
  | 'Overlays'
  | 'Product patterns'
  | 'Providers';

export interface ComponentFixture {
  readonly name: string;
  readonly slug: string;
  readonly group: ComponentGroup;
  /** Places related component pages under one collapsible sidebar heading. */
  readonly family?: string | undefined;
  /** Places the canonical family entry before its specialized children. */
  readonly familyOrder?: number | undefined;
  readonly summary: string;
  readonly component: () => JSX.Element;
  readonly demoSlug?: string | undefined;
  readonly browserCheck?: string | undefined;
}

const CURRENT_COMPONENT_FIXTURES: readonly ComponentFixture[] = [
  { name: 'Button', slug: 'button', group: 'Actions', family: 'Button', summary: 'Triggers an action or submits a form.', component: ButtonDemo, browserCheck: 'Keyboard focus ring' },
  { name: 'ButtonGroup', slug: 'button-group', group: 'Actions', family: 'Button', summary: 'Connects related actions with one roving focus stop.', component: ButtonGroupDemo, browserCheck: 'Roving focus and connected layout' },
  { name: 'Checkbox', slug: 'checkbox', group: 'Forms', family: 'Checkbox', summary: 'Toggles one boolean or mixed choice.', component: CheckboxDemo, browserCheck: 'Repeated pointer and Space activation' },
  { name: 'CheckboxGroup', slug: 'checkbox-group', group: 'Forms', family: 'Checkbox', summary: 'Coordinates related checkbox values and parent selection.', component: CheckboxGroupDemo, browserCheck: 'Value arrays and parent mixed state' },
  { name: 'CheckboxList', slug: 'checkbox-list', group: 'Forms', family: 'Checkbox', summary: 'Presents a labeled multi-value field as dense rows.', component: CheckboxListDemo, browserCheck: 'Row activation and field relationships' },
  { name: 'CheckboxListItem', slug: 'checkbox-list-item', group: 'Forms', family: 'Checkbox', summary: 'Composes one checkbox row with supporting content.', component: CheckboxListItemDemo, browserCheck: 'Label activation and inherited state' },
  { name: 'Field', slug: 'field', group: 'Forms', family: 'Field', familyOrder: 0, summary: 'Connects a control to its label, help text, and errors.', component: FieldDemo },
  { name: 'Fieldset', slug: 'fieldset', group: 'Forms', family: 'Form', summary: 'Groups related fields under one legend.', component: FieldsetDemo },
  { name: 'Form', slug: 'form', group: 'Forms', family: 'Form', familyOrder: 0, summary: 'Collects controls and reports validation errors.', component: FormDemo },
  { name: 'Input', slug: 'input', group: 'Forms', family: 'Input', summary: 'Provides the styled text-input base.', component: InputDemo },
  { name: 'IconButton', slug: 'icon-button', group: 'Actions', family: 'Button', summary: 'Exposes a compact icon action with a required name.', component: IconButtonDemo, browserCheck: 'Square size and accessible name' },
  { name: 'NumberField', slug: 'number-field', group: 'Forms', summary: 'Edits a number with keyboard and step controls.', component: NumberFieldDemo },
  { name: 'OTPField', slug: 'otp-field', group: 'Forms', summary: 'Collects a fixed sequence of one-time-code characters.', component: OTPFieldDemo },
  { name: 'Radio', slug: 'radio', group: 'Forms', family: 'Radio', summary: 'Selects one option inside a radio group.', component: RadioDemo, demoSlug: 'radio' },
  { name: 'RadioGroup', slug: 'radio-group', group: 'Forms', family: 'Radio', summary: 'Coordinates a set of mutually exclusive options.', component: RadioGroupDemo },
  { name: 'Select', slug: 'select', group: 'Forms', family: 'Select', familyOrder: 0, summary: 'Chooses one value from an anchored popup list.', component: SelectDemo, browserCheck: 'Popup position and keyboard choice' },
  { name: 'Slider', slug: 'slider', group: 'Forms', summary: 'Selects a numeric value from a range.', component: SliderDemo },
  { name: 'Switch', slug: 'switch', group: 'Forms', summary: 'Turns a setting on or off.', component: SwitchDemo },
  { name: 'Toggle', slug: 'toggle', group: 'Actions', family: 'Button', summary: 'Provides a two-state button.', component: ToggleDemo },
  { name: 'ToggleGroup', slug: 'toggle-group', group: 'Actions', family: 'Button', summary: 'Coordinates single-select or multi-select toggle buttons.', component: ToggleGroupDemo },
  { name: 'Accordion', slug: 'accordion', group: 'Content', family: 'Disclosure', summary: 'Shows collapsible content in a vertical item stack.', component: AccordionDemo },
  { name: 'Avatar', slug: 'avatar', group: 'Content', family: 'Avatar', familyOrder: 0, summary: 'Shows an image with a text fallback.', component: AvatarDemo },
  { name: 'CodeBlock', slug: 'code-block', group: 'Content', family: 'Code', familyOrder: 1, summary: 'Presents highlighted source in block or inline form.', component: CodeBlockDemo, browserCheck: 'TypeScript token colors and overflow' },
  { name: 'Collapsible', slug: 'collapsible', group: 'Content', family: 'Disclosure', familyOrder: 0, summary: 'Shows or hides one content panel.', component: CollapsibleDemo },
  { name: 'Meter', slug: 'meter', group: 'Data display', summary: 'Displays a scalar value within a known range.', component: MeterDemo },
  { name: 'Progress', slug: 'progress', group: 'Feedback', summary: 'Displays task completion or an unknown wait.', component: ProgressDemo },
  { name: 'ScrollArea', slug: 'scroll-area', group: 'Layout', summary: 'Adds styled scrollbars to native overflow.', component: ScrollAreaDemo, browserCheck: 'Real overflow geometry' },
  { name: 'Separator', slug: 'separator', group: 'Layout', summary: 'Separates content visually or semantically.', component: SeparatorDemo },
  { name: 'Tabs', slug: 'tabs', group: 'Navigation', summary: 'Shows one panel from a set of related sections.', component: TabsDemo },
  { name: 'Toolbar', slug: 'toolbar', group: 'Actions', summary: 'Groups controls with managed keyboard navigation.', component: ToolbarDemo },
  { name: 'AlertDialog', slug: 'alert-dialog', group: 'Overlays', family: 'Dialog', familyOrder: 2, summary: 'Blocks the page until the user answers a critical prompt.', component: AlertDialogDemo },
  { name: 'Autocomplete', slug: 'autocomplete', group: 'Forms', family: 'Combobox', familyOrder: 1, summary: 'Completes text from a filtered suggestion list.', component: AutocompleteDemo },
  { name: 'Combobox', slug: 'combobox', group: 'Forms', family: 'Combobox', familyOrder: 0, summary: 'Combines text input with a filtered choice popup.', component: ComboboxDemo },
  { name: 'ContextMenu', slug: 'context-menu', group: 'Overlays', family: 'Menu', familyOrder: 1, summary: 'Shows actions at a pointer or long-press position.', component: ContextMenuDemo },
  { name: 'Dialog', slug: 'dialog', group: 'Overlays', family: 'Dialog', familyOrder: 0, summary: 'Shows focused content above the current page.', component: DialogDemo },
  { name: 'Drawer', slug: 'drawer', group: 'Overlays', summary: 'Shows a dismissible panel from a viewport edge.', component: DrawerDemo, browserCheck: 'Pointer swipe dismissal' },
  { name: 'Menu', slug: 'menu', group: 'Overlays', family: 'Menu', familyOrder: 0, summary: 'Shows a popup list of actions from a trigger.', component: MenuDemo },
  { name: 'Menubar', slug: 'menubar', group: 'Overlays', family: 'Menu', familyOrder: 2, summary: 'Provides a persistent row of keyboard-driven menus.', component: MenubarDemo },
  { name: 'NavigationMenu', slug: 'navigation-menu', group: 'Navigation', family: 'Navigation', familyOrder: 99, summary: 'Groups site links with anchored detail panels.', component: NavigationMenuDemo, browserCheck: 'Active-trigger anchoring' },
  { name: 'Popover', slug: 'popover', group: 'Overlays', family: 'Anchored surfaces', familyOrder: 0, summary: 'Shows rich content beside a trigger.', component: PopoverDemo, browserCheck: 'Nested portal dismissal' },
  { name: 'PreviewCard', slug: 'preview-card', group: 'Overlays', family: 'Anchored surfaces', familyOrder: 1, summary: 'Previews linked content on focus or hover.', component: PreviewCardDemo },
  { name: 'Toast', slug: 'toast', group: 'Feedback', summary: 'Reports a temporary status without blocking work.', component: ToastDemo, browserCheck: 'Pointer swipe dismissal' },
  { name: 'Tooltip', slug: 'tooltip', group: 'Overlays', family: 'Anchored surfaces', familyOrder: 2, summary: 'Shows a short label on focus or hover.', component: TooltipDemo },
];

export const COMPONENT_FIXTURES: readonly ComponentFixture[] = [
  ...CURRENT_COMPONENT_FIXTURES,
  ...ASTRYX_COMPONENT_FIXTURES,
];

export const COMPONENT_GROUPS: readonly ComponentGroup[] = [
  'Actions',
  'Forms',
  'Content',
  'Data display',
  'Feedback',
  'Layout',
  'Navigation',
  'Overlays',
  'Product patterns',
  'Providers',
];
