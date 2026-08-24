import type { JSX } from 'solid-js';

import AccordionDemo from './component-demos/accordion';
import AlertDialogDemo from './component-demos/alert-dialog';
import AutocompleteDemo from './component-demos/autocomplete';
import AvatarDemo from './component-demos/avatar';
import ButtonDemo from './component-demos/button';
import CheckboxDemo from './component-demos/checkbox';
import CheckboxGroupDemo from './component-demos/checkbox-group';
import CollapsibleDemo from './component-demos/collapsible';
import ComboboxDemo from './component-demos/combobox';
import ContextMenuDemo from './component-demos/context-menu';
import DialogDemo from './component-demos/dialog';
import DrawerDemo from './component-demos/drawer';
import FieldDemo from './component-demos/field';
import FieldsetDemo from './component-demos/fieldset';
import FormDemo from './component-demos/form';
import InputDemo from './component-demos/input';
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

export type ComponentGroup = 'Forms' | 'Structure' | 'Floating surfaces';

export interface ComponentFixture {
  readonly name: string;
  readonly slug: string;
  readonly group: ComponentGroup;
  readonly summary: string;
  readonly component: () => JSX.Element;
  readonly demoSlug?: string | undefined;
  readonly browserCheck?: string | undefined;
}

export const COMPONENT_FIXTURES: readonly ComponentFixture[] = [
  { name: 'Button', slug: 'button', group: 'Forms', summary: 'Triggers an action or submits a form.', component: ButtonDemo, browserCheck: 'Keyboard focus ring' },
  { name: 'Checkbox', slug: 'checkbox', group: 'Forms', summary: 'Toggles one boolean choice.', component: CheckboxDemo },
  { name: 'CheckboxGroup', slug: 'checkbox-group', group: 'Forms', summary: 'Coordinates a set of related checkbox values.', component: CheckboxGroupDemo },
  { name: 'Field', slug: 'field', group: 'Forms', summary: 'Connects a control to its label, help text, and errors.', component: FieldDemo },
  { name: 'Fieldset', slug: 'fieldset', group: 'Forms', summary: 'Groups related fields under one legend.', component: FieldsetDemo },
  { name: 'Form', slug: 'form', group: 'Forms', summary: 'Collects controls and reports validation errors.', component: FormDemo },
  { name: 'Input', slug: 'input', group: 'Forms', summary: 'Provides the styled text-input base.', component: InputDemo },
  { name: 'NumberField', slug: 'number-field', group: 'Forms', summary: 'Edits a number with keyboard and step controls.', component: NumberFieldDemo },
  { name: 'OTPField', slug: 'otp-field', group: 'Forms', summary: 'Collects a fixed sequence of one-time-code characters.', component: OTPFieldDemo },
  { name: 'Radio', slug: 'radio', group: 'Forms', summary: 'Selects one option inside a radio group.', component: RadioDemo, demoSlug: 'radio' },
  { name: 'RadioGroup', slug: 'radio-group', group: 'Forms', summary: 'Coordinates a set of mutually exclusive options.', component: RadioDemo, demoSlug: 'radio' },
  { name: 'Select', slug: 'select', group: 'Forms', summary: 'Chooses one value from an anchored popup list.', component: SelectDemo, browserCheck: 'Popup position and keyboard choice' },
  { name: 'Slider', slug: 'slider', group: 'Forms', summary: 'Selects a numeric value from a range.', component: SliderDemo },
  { name: 'Switch', slug: 'switch', group: 'Forms', summary: 'Turns a setting on or off.', component: SwitchDemo },
  { name: 'Toggle', slug: 'toggle', group: 'Forms', summary: 'Provides a two-state button.', component: ToggleDemo },
  { name: 'ToggleGroup', slug: 'toggle-group', group: 'Forms', summary: 'Coordinates single-select or multi-select toggle buttons.', component: ToggleGroupDemo },
  { name: 'Accordion', slug: 'accordion', group: 'Structure', summary: 'Shows collapsible content in a vertical item stack.', component: AccordionDemo },
  { name: 'Avatar', slug: 'avatar', group: 'Structure', summary: 'Shows an image with a text fallback.', component: AvatarDemo },
  { name: 'Collapsible', slug: 'collapsible', group: 'Structure', summary: 'Shows or hides one content panel.', component: CollapsibleDemo },
  { name: 'Meter', slug: 'meter', group: 'Structure', summary: 'Displays a scalar value within a known range.', component: MeterDemo },
  { name: 'Progress', slug: 'progress', group: 'Structure', summary: 'Displays task completion or an unknown wait.', component: ProgressDemo },
  { name: 'ScrollArea', slug: 'scroll-area', group: 'Structure', summary: 'Adds styled scrollbars to native overflow.', component: ScrollAreaDemo, browserCheck: 'Real overflow geometry' },
  { name: 'Separator', slug: 'separator', group: 'Structure', summary: 'Separates content visually or semantically.', component: SeparatorDemo },
  { name: 'Tabs', slug: 'tabs', group: 'Structure', summary: 'Shows one panel from a set of related sections.', component: TabsDemo },
  { name: 'Toolbar', slug: 'toolbar', group: 'Structure', summary: 'Groups controls with managed keyboard navigation.', component: ToolbarDemo },
  { name: 'AlertDialog', slug: 'alert-dialog', group: 'Floating surfaces', summary: 'Blocks the page until the user answers a critical prompt.', component: AlertDialogDemo },
  { name: 'Autocomplete', slug: 'autocomplete', group: 'Floating surfaces', summary: 'Completes text from a filtered suggestion list.', component: AutocompleteDemo },
  { name: 'Combobox', slug: 'combobox', group: 'Floating surfaces', summary: 'Combines text input with a filtered choice popup.', component: ComboboxDemo },
  { name: 'ContextMenu', slug: 'context-menu', group: 'Floating surfaces', summary: 'Shows actions at a pointer or long-press position.', component: ContextMenuDemo },
  { name: 'Dialog', slug: 'dialog', group: 'Floating surfaces', summary: 'Shows focused content above the current page.', component: DialogDemo },
  { name: 'Drawer', slug: 'drawer', group: 'Floating surfaces', summary: 'Shows a dismissible panel from a viewport edge.', component: DrawerDemo, browserCheck: 'Pointer swipe dismissal' },
  { name: 'Menu', slug: 'menu', group: 'Floating surfaces', summary: 'Shows a popup list of actions from a trigger.', component: MenuDemo },
  { name: 'Menubar', slug: 'menubar', group: 'Floating surfaces', summary: 'Provides a persistent row of keyboard-driven menus.', component: MenubarDemo },
  { name: 'NavigationMenu', slug: 'navigation-menu', group: 'Floating surfaces', summary: 'Groups site links with anchored detail panels.', component: NavigationMenuDemo, browserCheck: 'Active-trigger anchoring' },
  { name: 'Popover', slug: 'popover', group: 'Floating surfaces', summary: 'Shows rich content beside a trigger.', component: PopoverDemo, browserCheck: 'Nested portal dismissal' },
  { name: 'PreviewCard', slug: 'preview-card', group: 'Floating surfaces', summary: 'Previews linked content on focus or hover.', component: PreviewCardDemo },
  { name: 'Toast', slug: 'toast', group: 'Floating surfaces', summary: 'Reports a temporary status without blocking work.', component: ToastDemo, browserCheck: 'Pointer swipe dismissal' },
  { name: 'Tooltip', slug: 'tooltip', group: 'Floating surfaces', summary: 'Shows a short label on focus or hover.', component: TooltipDemo },
];

export const COMPONENT_GROUPS: readonly ComponentGroup[] = [
  'Forms',
  'Structure',
  'Floating surfaces',
];
