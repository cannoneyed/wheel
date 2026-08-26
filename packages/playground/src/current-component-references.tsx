import type { Component, JSX } from 'solid-js';

import AccordionDemo from './component-demos/accordion';
import AlertDialogDemo from './component-demos/alert-dialog';
import AutocompleteDemo from './component-demos/autocomplete';
import AvatarDemo from './component-demos/avatar';
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
import RadioGroupDemo from './component-demos/radio-group';
import ScrollAreaDemo from './component-demos/scroll-area';
import SeparatorDemo from './component-demos/separator';
import SliderDemo from './component-demos/slider';
import SwitchDemo from './component-demos/switch';
import TabsDemo from './component-demos/tabs';
import ToastDemo from './component-demos/toast';
import ToolbarDemo from './component-demos/toolbar';
import TooltipDemo from './component-demos/tooltip';
import type {
  ComponentReferenceDefinition,
  ComponentReferenceProp,
} from './component-reference';

const compositionProps: readonly ComponentReferenceProp[] = [
  { name: 'as / asChild', type: 'ElementType / boolean', defaultValue: '— / false', description: 'Changes the rendered element without adding a wrapper.' },
  { name: 'class / style', type: 'value | state function', defaultValue: '—', description: 'Styles the part from its resolved component state.' },
];

interface ReferenceOptions {
  readonly Demo: Component;
  readonly usageCode: string;
  readonly props: readonly ComponentReferenceProp[];
  readonly exampleTitle: string;
  readonly exampleDescription: string;
  readonly exampleCode?: string | undefined;
}

function makeReference(options: ReferenceOptions): ComponentReferenceDefinition {
  const Example = (): JSX.Element => <options.Demo />;
  return {
    usageCode: options.usageCode,
    props: [...options.props, ...compositionProps],
    examples: [{
      title: options.exampleTitle,
      description: options.exampleDescription,
      component: Example,
      code: options.exampleCode ?? options.usageCode,
    }],
  };
}

const controlledOpenProps: readonly ComponentReferenceProp[] = [
  { name: 'open', type: 'boolean', defaultValue: '—', description: 'Controls whether the content is open.' },
  { name: 'defaultOpen', type: 'boolean', defaultValue: 'false', description: 'Sets the initial uncontrolled open state.' },
  { name: 'onOpenChange', type: '(open, details) => void', defaultValue: '—', description: 'Reports open and close requests with their reason.' },
  { name: 'disabled', type: 'boolean', defaultValue: 'false', description: 'Blocks the owning trigger and state changes.' },
];

const popupPositionProps: readonly ComponentReferenceProp[] = [
  { name: 'Positioner.side', type: "'top' | 'right' | 'bottom' | 'left'", defaultValue: "'bottom'", description: 'Sets the preferred side before collision handling.' },
  { name: 'Positioner.align', type: "'start' | 'center' | 'end'", defaultValue: "'center'", description: 'Aligns the popup along its anchor.' },
  { name: 'Positioner.sideOffset', type: 'number', defaultValue: '0', description: 'Adds space between popup and anchor.' },
  { name: 'Portal.container', type: 'HTMLElement | ShadowRoot', defaultValue: 'document.body', description: 'Chooses the layer container.' },
];

export const CURRENT_COMPONENT_REFERENCES: Readonly<Record<string, ComponentReferenceDefinition>> = {
  accordion: makeReference({
    Demo: AccordionDemo,
    usageCode: `import { Accordion } from 'wheel/components';

<Accordion.Root defaultValue={['details']}>
  <Accordion.Item value="details">
    <Accordion.Header>
      <Accordion.Trigger>Project details</Accordion.Trigger>
    </Accordion.Header>
    <Accordion.Panel>Panel content</Accordion.Panel>
  </Accordion.Item>
</Accordion.Root>`,
    props: [
      { name: 'value', type: 'string[]', defaultValue: '—', description: 'Controls the expanded item values.' },
      { name: 'defaultValue', type: 'string[]', defaultValue: '[]', description: 'Sets the initial uncontrolled expanded items.' },
      { name: 'onValueChange', type: '(value, details) => void', defaultValue: '—', description: 'Reports requested expansion changes.' },
      { name: 'multiple', type: 'boolean', defaultValue: 'false', description: 'Allows more than one item to remain open.' },
      { name: 'orientation', type: "'horizontal' | 'vertical'", defaultValue: "'vertical'", description: 'Sets layout and navigation keys.' },
      { name: 'loop', type: 'boolean', defaultValue: 'true', description: 'Wraps keyboard focus at the ends.' },
      { name: 'Item.value', type: 'string', defaultValue: '—', description: 'Provides the stable identity for one item.' },
      { name: 'Item.disabled', type: 'boolean', defaultValue: 'false', description: 'Blocks one disclosure without disabling its siblings.' },
    ],
    exampleTitle: 'Disclosure stack',
    exampleDescription: 'Compose each header, trigger, and panel under one value owner.',
  }),
  'alert-dialog': makeReference({
    Demo: AlertDialogDemo,
    usageCode: `import { AlertDialog, Button } from 'wheel/components';

<AlertDialog.Root>
  <AlertDialog.Trigger>Delete project</AlertDialog.Trigger>
  <AlertDialog.Portal>
    <AlertDialog.Backdrop />
    <AlertDialog.Viewport>
      <AlertDialog.Popup>
        <AlertDialog.Title>Delete project?</AlertDialog.Title>
        <AlertDialog.Description>This cannot be undone.</AlertDialog.Description>
        <AlertDialog.Close>Cancel</AlertDialog.Close>
        <Button variant="destructive">Delete</Button>
      </AlertDialog.Popup>
    </AlertDialog.Viewport>
  </AlertDialog.Portal>
</AlertDialog.Root>`,
    props: [
      ...controlledOpenProps,
      { name: 'modal', type: 'boolean', defaultValue: 'true', description: 'Traps focus and blocks outside interaction.' },
      { name: 'initialFocus', type: 'HTMLElement | function', defaultValue: 'first safe action', description: 'Chooses the first focused control.' },
      { name: 'finalFocus', type: 'HTMLElement | function | boolean', defaultValue: 'Trigger', description: 'Chooses focus after close.' },
      { name: 'disablePointerDismissal', type: 'boolean', defaultValue: 'true', description: 'Requires an explicit decision instead of backdrop dismissal.' },
    ],
    exampleTitle: 'Required decision',
    exampleDescription: 'Keep the consequence, safe action, and destructive action inside one focus scope.',
  }),
  autocomplete: makeReference({
    Demo: AutocompleteDemo,
    usageCode: `import { Autocomplete } from 'wheel/components';

<Autocomplete.Root items={people}>
  <Autocomplete.Input placeholder="Find a person" />
  <Autocomplete.Portal>
    <Autocomplete.Positioner>
      <Autocomplete.Popup>
        <Autocomplete.List>
          {(person) => <Autocomplete.Item value={person}>{person.name}</Autocomplete.Item>}
        </Autocomplete.List>
      </Autocomplete.Popup>
    </Autocomplete.Positioner>
  </Autocomplete.Portal>
</Autocomplete.Root>`,
    props: [
      { name: 'value', type: 'string', defaultValue: '—', description: 'Controls the editable text value.' },
      { name: 'defaultValue', type: 'string', defaultValue: "''", description: 'Sets the initial uncontrolled text.' },
      { name: 'onValueChange', type: '(value, details) => void', defaultValue: '—', description: 'Reports text edits and committed suggestions.' },
      { name: 'items', type: 'Item[]', defaultValue: '[]', description: 'Supplies the current suggestion collection.' },
      { name: 'filter', type: '(item, query) => boolean', defaultValue: 'built-in text match', description: 'Filters local suggestions.' },
      { name: 'disabled / readOnly', type: 'boolean', defaultValue: 'false', description: 'Blocks edits or all interaction as appropriate.' },
      ...controlledOpenProps.slice(0, 3),
      ...popupPositionProps,
    ],
    exampleTitle: 'Filtered suggestions',
    exampleDescription: 'Text entry, list navigation, empty state, and commit stay in one composition.',
  }),
  avatar: makeReference({
    Demo: AvatarDemo,
    usageCode: `import { Avatar } from 'wheel/components';

<Avatar.Root>
  <Avatar.Image src={person.photo} alt="" />
  <Avatar.Fallback>AC</Avatar.Fallback>
</Avatar.Root>`,
    props: [
      { name: 'Image.src', type: 'string', defaultValue: '—', description: 'Supplies the native image source.' },
      { name: 'Image.alt', type: 'string', defaultValue: "''", description: 'Describes meaningful images or marks identity images decorative.' },
      { name: 'Fallback.delay', type: 'number', defaultValue: '0', description: 'Delays fallback display while an image is likely to load.' },
      { name: 'size', type: "'xs' | 'sm' | 'md' | 'lg' | 'xl'", defaultValue: "'md'", description: 'Sets identity, initials, and status geometry.' },
      { name: 'shape', type: "'circle' | 'rounded' | 'square'", defaultValue: "'circle'", description: 'Sets the clipping shape.' },
      { name: 'status', type: "'online' | 'busy' | 'away' | 'offline'", defaultValue: '—', description: 'Adds an optional named availability mark.' },
    ],
    exampleTitle: 'Image with fallback',
    exampleDescription: 'Fallback remains stable until the image has loaded successfully.',
  }),
  collapsible: makeReference({
    Demo: CollapsibleDemo,
    usageCode: `import { Collapsible } from 'wheel/components';

<Collapsible.Root>
  <Collapsible.Trigger>Advanced settings</Collapsible.Trigger>
  <Collapsible.Panel>Settings content</Collapsible.Panel>
</Collapsible.Root>`,
    props: [
      ...controlledOpenProps,
      { name: 'Panel.keepMounted', type: 'boolean', defaultValue: 'false', description: 'Keeps hidden content mounted without leaving it interactive.' },
    ],
    exampleTitle: 'Single disclosure',
    exampleDescription: 'The trigger and panel keep their ids and state connected across repeated toggles.',
  }),
  combobox: makeReference({
    Demo: ComboboxDemo,
    usageCode: `import { Combobox } from 'wheel/components';

<Combobox.Root items={people}>
  <Combobox.Input placeholder="Choose a person" />
  <Combobox.Trigger />
  <Combobox.Clear />
  <Combobox.Portal>
    <Combobox.Positioner>
      <Combobox.Popup>
        <Combobox.List>
          {(person) => <Combobox.Item value={person}>{person.name}</Combobox.Item>}
        </Combobox.List>
      </Combobox.Popup>
    </Combobox.Positioner>
  </Combobox.Portal>
</Combobox.Root>`,
    props: [
      { name: 'value', type: 'Value | Value[] | null', defaultValue: '—', description: 'Controls committed values.' },
      { name: 'inputValue', type: 'string', defaultValue: '—', description: 'Controls editable text separately from selection.' },
      { name: 'multiple', type: 'boolean', defaultValue: 'false', description: 'Enables chips and multiple committed values.' },
      { name: 'items', type: 'Item[] | Group[]', defaultValue: '[]', description: 'Supplies current results.' },
      { name: 'disabled / readOnly / required', type: 'boolean', defaultValue: 'false', description: 'Applies field constraints to every part.' },
      { name: 'name / form', type: 'string', defaultValue: '—', description: 'Connects committed values to native forms.' },
      ...controlledOpenProps.slice(0, 3),
      ...popupPositionProps,
    ],
    exampleTitle: 'Editable selection',
    exampleDescription: 'Input, clear action, popup results, and committed value stay separate.',
  }),
  'context-menu': makeReference({
    Demo: ContextMenuDemo,
    usageCode: `import { ContextMenu } from 'wheel/components';

<ContextMenu.Root>
  <ContextMenu.Trigger>Right-click this area</ContextMenu.Trigger>
  <ContextMenu.Portal>
    <ContextMenu.Positioner>
      <ContextMenu.Popup>
        <ContextMenu.Item>Rename</ContextMenu.Item>
        <ContextMenu.Item>Duplicate</ContextMenu.Item>
      </ContextMenu.Popup>
    </ContextMenu.Positioner>
  </ContextMenu.Portal>
</ContextMenu.Root>`,
    props: [
      ...controlledOpenProps.slice(0, 3),
      { name: 'disabled', type: 'boolean', defaultValue: 'false', description: 'Leaves the native context menu available when disabled.' },
      { name: 'Item.disabled', type: 'boolean', defaultValue: 'false', description: 'Keeps an action visible but skips focus and activation.' },
      { name: 'Item.closeOnClick', type: 'boolean', defaultValue: 'true', description: 'Controls tree dismissal after activation.' },
      { name: 'CheckboxItem.checked', type: 'boolean', defaultValue: 'false', description: 'Controls a menu checkbox value.' },
      { name: 'RadioGroup.value', type: 'string', defaultValue: '—', description: 'Controls one selected radio item.' },
      ...popupPositionProps,
    ],
    exampleTitle: 'Pointer-positioned actions',
    exampleDescription: 'Right click, long press, and keyboard invocation share the Menu item system.',
  }),
  dialog: makeReference({
    Demo: DialogDemo,
    usageCode: `import { Dialog } from 'wheel/components';

<Dialog.Root>
  <Dialog.Trigger>Edit project</Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Backdrop />
    <Dialog.Viewport>
      <Dialog.Popup>
        <Dialog.Title>Edit project</Dialog.Title>
        <Dialog.Description>Change project details.</Dialog.Description>
        <Dialog.Close>Close</Dialog.Close>
      </Dialog.Popup>
    </Dialog.Viewport>
  </Dialog.Portal>
</Dialog.Root>`,
    props: [
      ...controlledOpenProps,
      { name: 'modal', type: 'boolean', defaultValue: 'true', description: 'Traps focus and blocks outside interaction.' },
      { name: 'initialFocus', type: 'HTMLElement | function', defaultValue: 'first useful control', description: 'Chooses focus after open.' },
      { name: 'finalFocus', type: 'HTMLElement | function | boolean', defaultValue: 'Trigger', description: 'Chooses focus after close.' },
      { name: 'Popup.variant', type: "'standard' | 'wide' | 'fullscreen'", defaultValue: "'standard'", description: 'Sets dialog presentation without changing semantics.' },
    ],
    exampleTitle: 'Modal workflow',
    exampleDescription: 'Title, description, focus ownership, and close control remain explicit parts.',
  }),
  drawer: makeReference({
    Demo: DrawerDemo,
    usageCode: `import { Drawer } from 'wheel/components';

<Drawer.Root swipeDirection="down">
  <Drawer.Trigger>Open details</Drawer.Trigger>
  <Drawer.Portal>
    <Drawer.Backdrop />
    <Drawer.Viewport>
      <Drawer.Popup>
        <Drawer.Title>Details</Drawer.Title>
        <Drawer.Content>Drawer content</Drawer.Content>
        <Drawer.Close>Close</Drawer.Close>
      </Drawer.Popup>
    </Drawer.Viewport>
  </Drawer.Portal>
</Drawer.Root>`,
    props: [
      ...controlledOpenProps,
      { name: 'swipeDirection', type: "'up' | 'right' | 'down' | 'left'", defaultValue: "'down'", description: 'Sets edge and dismissal direction.' },
      { name: 'modal', type: 'boolean', defaultValue: 'true', description: 'Controls focus trap, scroll lock, and outside interaction.' },
      { name: 'snapPoints', type: 'number[]', defaultValue: '[1]', description: 'Defines available open extents.' },
      { name: 'indent', type: 'number | string', defaultValue: '0', description: 'Offsets the visual drawer edge.' },
    ],
    exampleTitle: 'Edge panel and swipe',
    exampleDescription: 'Focus, close controls, and swipe preview share one open state.',
  }),
  field: makeReference({
    Demo: FieldDemo,
    usageCode: `import { Field, Input } from 'wheel/components';

<Field.Root>
  <Field.Label>Project name</Field.Label>
  <Field.Control as={Input} required />
  <Field.Description>Shown to collaborators.</Field.Description>
  <Field.Error match="valueMissing">Enter a project name.</Field.Error>
</Field.Root>`,
    props: [
      { name: 'name', type: 'string', defaultValue: '—', description: 'Identifies validation errors and form state.' },
      { name: 'disabled', type: 'boolean', defaultValue: 'false', description: 'Disables the registered control.' },
      { name: 'invalid', type: 'boolean', defaultValue: 'native validity', description: 'Controls invalid state when validation is external.' },
      { name: 'validationMode', type: "'onSubmit' | 'onBlur' | 'onChange'", defaultValue: "'onSubmit'", description: 'Chooses when current validity is committed.' },
      { name: 'validation', type: '(value) => string | string[] | null', defaultValue: 'native validity', description: 'Adds custom validation results.' },
      { name: 'Error.match', type: 'validity key | boolean | function', defaultValue: 'invalid', description: 'Chooses which error state renders the message.' },
    ],
    exampleTitle: 'Labeled validation field',
    exampleDescription: 'Label, help, native control, and matching error share generated relationships.',
  }),
  fieldset: makeReference({
    Demo: FieldsetDemo,
    usageCode: `import { Fieldset } from 'wheel/components';

<Fieldset.Root>
  <Fieldset.Legend>Notifications</Fieldset.Legend>
  {/* Related fields */}
</Fieldset.Root>`,
    props: [
      { name: 'disabled', type: 'boolean', defaultValue: 'false', description: 'Uses native fieldset behavior to disable descendants.' },
      { name: 'name', type: 'string', defaultValue: '—', description: 'Adds a native fieldset name when needed.' },
      { name: 'Legend.children', type: 'JSX.Element', defaultValue: '—', description: 'Provides the group accessible name.' },
    ],
    exampleTitle: 'Native field group',
    exampleDescription: 'Legend names the whole control set and disabled state reaches descendants.',
  }),
  form: makeReference({
    Demo: FormDemo,
    usageCode: `import { Form, Field, Input, Button } from 'wheel/components';

<Form onSubmit={saveProject} errors={serverErrors()}>
  <Field.Root name="name">
    <Field.Label>Project name</Field.Label>
    <Field.Control as={Input} required />
    <Field.Error />
  </Field.Root>
  <Button type="submit">Save</Button>
</Form>`,
    props: [
      { name: 'onSubmit', type: '(event) => void | Promise<void>', defaultValue: '—', description: 'Runs after native validation succeeds.' },
      { name: 'errors', type: 'Record<string, string | string[]>', defaultValue: '{}', description: 'Supplies external validation errors by field name.' },
      { name: 'onClearErrors', type: '(name) => void', defaultValue: '—', description: 'Requests removal when a field changes.' },
      { name: 'onReset', type: 'FormEvent handler', defaultValue: 'native reset', description: 'Observes native reset after controls restore initial state.' },
      { name: 'action / method / encType', type: 'native form props', defaultValue: 'browser defaults', description: 'Preserves native form submission configuration.' },
    ],
    exampleTitle: 'Validation and submit',
    exampleDescription: 'Native Form, Field state, and Button actions remain composable.',
  }),
  input: makeReference({
    Demo: InputDemo,
    usageCode: `import { Field, Input } from 'wheel/components';

<Field.Root>
  <Field.Label>Email</Field.Label>
  <Field.Control as={Input} type="email" placeholder="name@example.com" />
</Field.Root>`,
    props: [
      { name: 'value / defaultValue', type: 'string', defaultValue: '—', description: 'Uses native controlled or uncontrolled input state.' },
      { name: 'type', type: 'HTMLInputTypeAttribute', defaultValue: "'text'", description: 'Preserves native input behavior.' },
      { name: 'size', type: "'sm' | 'md' | 'lg'", defaultValue: "'md'", description: 'Sets shared control height and type.' },
      { name: 'variant', type: "'input' | 'ghost' | 'quiet'", defaultValue: "'input'", description: 'Sets the resting surface.' },
      { name: 'status', type: "'success' | 'warning' | 'error'", defaultValue: '—', description: 'Adds a field tone without replacing validity.' },
      { name: 'disabled / readOnly / required', type: 'boolean', defaultValue: 'false', description: 'Passes native field constraints through.' },
      { name: 'name / form / autoComplete', type: 'string', defaultValue: '—', description: 'Configures native form and autofill behavior.' },
      { name: 'onInput / onChange', type: 'native event handlers', defaultValue: '—', description: 'Reports edits without a private value event.' },
    ],
    exampleTitle: 'Native text input',
    exampleDescription: 'The recipe preserves input types, form behavior, and Field relationships.',
  }),
  menu: makeReference({
    Demo: MenuDemo,
    usageCode: `import { Menu } from 'wheel/components';

<Menu.Root>
  <Menu.Trigger>Actions</Menu.Trigger>
  <Menu.Portal>
    <Menu.Positioner>
      <Menu.Popup>
        <Menu.Item>Rename</Menu.Item>
        <Menu.Item>Duplicate</Menu.Item>
      </Menu.Popup>
    </Menu.Positioner>
  </Menu.Portal>
</Menu.Root>`,
    props: [
      ...controlledOpenProps.slice(0, 3),
      { name: 'modal', type: 'boolean', defaultValue: 'true', description: 'Controls outside interaction while the menu is open.' },
      { name: 'Item.disabled', type: 'boolean', defaultValue: 'false', description: 'Skips one action during focus movement and activation.' },
      { name: 'Item.closeOnClick', type: 'boolean', defaultValue: 'true', description: 'Controls dismissal after one action.' },
      { name: 'CheckboxItem.checked', type: 'boolean', defaultValue: 'false', description: 'Controls a menu checkbox.' },
      { name: 'RadioGroup.value', type: 'string', defaultValue: '—', description: 'Controls one selected menu radio item.' },
      ...popupPositionProps,
    ],
    exampleTitle: 'Action menu',
    exampleDescription: 'Actions, links, selection items, and submenus share one keyboard model.',
  }),
  menubar: makeReference({
    Demo: MenubarDemo,
    usageCode: `import { Menubar } from 'wheel/components';

<Menubar.Root>
  <Menubar.Menu>
    <Menubar.Trigger>File</Menubar.Trigger>
    <Menubar.Portal>
      <Menubar.Positioner>
        <Menubar.Popup><Menubar.Item>New</Menubar.Item></Menubar.Popup>
      </Menubar.Positioner>
    </Menubar.Portal>
  </Menubar.Menu>
</Menubar.Root>`,
    props: [
      { name: 'value', type: 'string | null', defaultValue: '—', description: 'Controls the currently open top-level menu.' },
      { name: 'defaultValue', type: 'string | null', defaultValue: 'null', description: 'Sets the initial uncontrolled open menu.' },
      { name: 'onValueChange', type: '(value) => void', defaultValue: '—', description: 'Reports top-level menu changes.' },
      { name: 'loop', type: 'boolean', defaultValue: 'true', description: 'Wraps top-level keyboard navigation.' },
      { name: 'Menu.value', type: 'string', defaultValue: 'generated', description: 'Identifies one top-level menu.' },
    ],
    exampleTitle: 'Persistent application menu',
    exampleDescription: 'Top-level focus and each popup menu stay coordinated.',
  }),
  meter: makeReference({
    Demo: MeterDemo,
    usageCode: `import { Meter } from 'wheel/components';

<Meter.Root value={72} min={0} max={100}>
  <Meter.Label>Storage used</Meter.Label>
  <Meter.Track><Meter.Indicator /></Meter.Track>
  <Meter.Value />
</Meter.Root>`,
    props: [
      { name: 'value', type: 'number', defaultValue: '0', description: 'Sets the current scalar measurement.' },
      { name: 'min / max', type: 'number', defaultValue: '0 / 100', description: 'Sets the measurement range.' },
      { name: 'low / high / optimum', type: 'number', defaultValue: '—', description: 'Defines meaningful native meter ranges.' },
      { name: 'getValueLabel', type: '(value, max) => string', defaultValue: 'percentage', description: 'Formats the accessible and visible value label.' },
    ],
    exampleTitle: 'Known scalar range',
    exampleDescription: 'Label, track, indicator, and formatted value remain separate parts.',
  }),
  'navigation-menu': makeReference({
    Demo: NavigationMenuDemo,
    usageCode: `import { NavigationMenu } from 'wheel/components';

<NavigationMenu.Root>
  <NavigationMenu.List>
    <NavigationMenu.Item>
      <NavigationMenu.Trigger>Products</NavigationMenu.Trigger>
      <NavigationMenu.Content>Product links</NavigationMenu.Content>
    </NavigationMenu.Item>
    <NavigationMenu.Item><NavigationMenu.Link href="/pricing">Pricing</NavigationMenu.Link></NavigationMenu.Item>
  </NavigationMenu.List>
</NavigationMenu.Root>`,
    props: [
      { name: 'value', type: 'string | null', defaultValue: '—', description: 'Controls the open content value.' },
      { name: 'defaultValue', type: 'string | null', defaultValue: 'null', description: 'Sets initial uncontrolled content.' },
      { name: 'onValueChange', type: '(value) => void', defaultValue: '—', description: 'Reports content switches.' },
      { name: 'delay / closeDelay', type: 'number', defaultValue: 'provider tokens', description: 'Sets pointer intent timing without entry animation.' },
      { name: 'orientation', type: "'horizontal' | 'vertical'", defaultValue: "'horizontal'", description: 'Sets layout and composite navigation.' },
      ...popupPositionProps,
    ],
    exampleTitle: 'Primary navigation',
    exampleDescription: 'Native links and optional anchored content keep distinct semantics.',
  }),
  'number-field': makeReference({
    Demo: NumberFieldDemo,
    usageCode: `import { NumberField } from 'wheel/components';

<NumberField.Root defaultValue={4} min={0} max={10}>
  <NumberField.Group>
    <NumberField.Decrement>−</NumberField.Decrement>
    <NumberField.Input />
    <NumberField.Increment>+</NumberField.Increment>
  </NumberField.Group>
</NumberField.Root>`,
    props: [
      { name: 'value', type: 'number | null', defaultValue: '—', description: 'Controls the committed numeric value.' },
      { name: 'defaultValue', type: 'number | null', defaultValue: 'null', description: 'Sets the initial uncontrolled value.' },
      { name: 'onValueChange', type: '(value, details) => void', defaultValue: '—', description: 'Reports step, text, and scrub commits.' },
      { name: 'min / max / step', type: 'number', defaultValue: '— / — / 1', description: 'Constrains and increments values.' },
      { name: 'largeStep', type: 'number', defaultValue: 'step × 10', description: 'Sets PageUp and PageDown change.' },
      { name: 'format', type: 'Intl.NumberFormatOptions', defaultValue: 'locale default', description: 'Formats and parses localized text.' },
      { name: 'disabled / readOnly / required', type: 'boolean', defaultValue: 'false', description: 'Applies constraints to every part.' },
    ],
    exampleTitle: 'Text and step controls',
    exampleDescription: 'Input, buttons, keyboard steps, and scrub all commit through one numeric owner.',
  }),
  'otp-field': makeReference({
    Demo: OTPFieldDemo,
    usageCode: `import { OTPField } from 'wheel/components';

<OTPField.Root maxLength={6}>
  <OTPField.Input />
  <OTPField.Group>
    {Array.from({ length: 6 }, (_, index) => <OTPField.Slot index={index} />)}
  </OTPField.Group>
</OTPField.Root>`,
    props: [
      { name: 'value', type: 'string', defaultValue: '—', description: 'Controls the complete code string.' },
      { name: 'defaultValue', type: 'string', defaultValue: "''", description: 'Sets the initial uncontrolled code.' },
      { name: 'onValueChange', type: '(value) => void', defaultValue: '—', description: 'Reports typing, paste, delete, and autofill changes.' },
      { name: 'maxLength', type: 'number', defaultValue: '—', description: 'Sets the required slot count.' },
      { name: 'pattern', type: 'RegExp | string', defaultValue: 'digits', description: 'Accepts only matching characters.' },
      { name: 'onComplete', type: '(value) => void', defaultValue: '—', description: 'Runs on a transition to a complete valid code.' },
      { name: 'disabled / readOnly', type: 'boolean', defaultValue: 'false', description: 'Blocks edits while preserving the appropriate field behavior.' },
    ],
    exampleTitle: 'One-time code entry',
    exampleDescription: 'One native input drives fixed visual slots, paste, and autofill.',
  }),
  popover: makeReference({
    Demo: PopoverDemo,
    usageCode: `import { Popover } from 'wheel/components';

<Popover.Root>
  <Popover.Trigger>Project details</Popover.Trigger>
  <Popover.Portal>
    <Popover.Positioner sideOffset={4}>
      <Popover.Popup>
        <Popover.Title>Project details</Popover.Title>
        <Popover.Description>Additional information.</Popover.Description>
        <Popover.Close>Close</Popover.Close>
      </Popover.Popup>
    </Popover.Positioner>
  </Popover.Portal>
</Popover.Root>`,
    props: [...controlledOpenProps, ...popupPositionProps,
      { name: 'modal', type: 'boolean', defaultValue: 'false', description: 'Optionally blocks outside interaction and traps focus.' },
      { name: 'initialFocus / finalFocus', type: 'focus target | function | boolean', defaultValue: 'interaction dependent', description: 'Controls focus ownership across open and close.' },
    ],
    exampleTitle: 'Anchored rich content',
    exampleDescription: 'Trigger, named content, close action, focus policy, and positioning stay explicit.',
  }),
  'preview-card': makeReference({
    Demo: PreviewCardDemo,
    usageCode: `import { PreviewCard } from 'wheel/components';

<PreviewCard.Root>
  <PreviewCard.Trigger href="/people/ada">Ada Lovelace</PreviewCard.Trigger>
  <PreviewCard.Portal>
    <PreviewCard.Positioner>
      <PreviewCard.Popup>Profile preview</PreviewCard.Popup>
    </PreviewCard.Positioner>
  </PreviewCard.Portal>
</PreviewCard.Root>`,
    props: [
      ...controlledOpenProps.slice(0, 3),
      { name: 'delay', type: 'number', defaultValue: '600', description: 'Waits for focus or pointer intent before opening.' },
      { name: 'closeDelay', type: 'number', defaultValue: '300', description: 'Keeps the safe pointer corridor available.' },
      ...popupPositionProps,
    ],
    exampleTitle: 'Linked content preview',
    exampleDescription: 'A native link remains primary while focus and hover may reveal extra context.',
  }),
  progress: makeReference({
    Demo: ProgressDemo,
    usageCode: `import { Progress } from 'wheel/components';

<Progress.Root value={uploadProgress()}>
  <Progress.Label>Uploading files</Progress.Label>
  <Progress.Track><Progress.Indicator /></Progress.Track>
  <Progress.Value />
</Progress.Root>`,
    props: [
      { name: 'value', type: 'number | null', defaultValue: 'null', description: 'Sets determinate progress or null for indeterminate state.' },
      { name: 'min / max', type: 'number', defaultValue: '0 / 100', description: 'Sets the determinate range.' },
      { name: 'getValueLabel', type: '(value, max) => string', defaultValue: 'percentage', description: 'Formats visible and accessible progress.' },
      { name: 'status', type: "'progressing' | 'complete' | 'indeterminate'", defaultValue: 'derived', description: 'Exposes task state to styled parts.' },
    ],
    exampleTitle: 'Determinate and indeterminate progress',
    exampleDescription: 'Task label, track, indicator, and formatted value remain composable.',
  }),
  radio: makeReference({
    Demo: RadioDemo,
    usageCode: `import { Radio, RadioGroup } from 'wheel/components';

<RadioGroup defaultValue="daily">
  <label><Radio.Root value="daily"><Radio.Indicator /></Radio.Root>Daily</label>
  <label><Radio.Root value="weekly"><Radio.Indicator /></Radio.Root>Weekly</label>
</RadioGroup>`,
    props: [
      { name: 'value', type: 'string', defaultValue: '—', description: 'Identifies this option inside Radio Group.' },
      { name: 'disabled', type: 'boolean', defaultValue: 'false', description: 'Skips this option during focus and selection.' },
      { name: 'readOnly', type: 'boolean', defaultValue: 'false', description: 'Keeps the option focusable while blocking value changes.' },
      { name: 'required', type: 'boolean', defaultValue: 'group value', description: 'Participates in native required validation.' },
      { name: 'name / form', type: 'string', defaultValue: 'group value', description: 'Connects the hidden native radio to its form.' },
      { name: 'Indicator.keepMounted', type: 'boolean', defaultValue: 'false', description: 'Keeps the selection mark in the DOM while unchecked.' },
    ],
    exampleTitle: 'Radio options',
    exampleDescription: 'Each named option composes a Root and Indicator under one group owner.',
  }),
  'radio-group': makeReference({
    Demo: RadioGroupDemo,
    usageCode: `import { Radio, RadioGroup } from 'wheel/components';

<RadioGroup defaultValue="daily" orientation="vertical">
  <label><Radio.Root value="daily"><Radio.Indicator /></Radio.Root>Daily</label>
  <label><Radio.Root value="weekly"><Radio.Indicator /></Radio.Root>Weekly</label>
</RadioGroup>`,
    props: [
      { name: 'value', type: 'string | null', defaultValue: '—', description: 'Controls the selected option value.' },
      { name: 'defaultValue', type: 'string | null', defaultValue: 'null', description: 'Sets the initial uncontrolled option.' },
      { name: 'onValueChange', type: '(value, details) => void', defaultValue: '—', description: 'Reports requested selection changes.' },
      { name: 'orientation', type: "'horizontal' | 'vertical'", defaultValue: "'vertical'", description: 'Sets layout and navigation keys.' },
      { name: 'disabled / readOnly / required', type: 'boolean', defaultValue: 'false', description: 'Applies group constraints to every Radio.' },
      { name: 'name / form', type: 'string', defaultValue: '—', description: 'Configures native radio form submission.' },
    ],
    exampleTitle: 'Mutually exclusive group',
    exampleDescription: 'Roving focus and one selected value remain group-owned.',
  }),
  'scroll-area': makeReference({
    Demo: ScrollAreaDemo,
    usageCode: `import { ScrollArea } from 'wheel/components';

<ScrollArea.Root>
  <ScrollArea.Viewport>{longContent}</ScrollArea.Viewport>
  <ScrollArea.Scrollbar orientation="vertical">
    <ScrollArea.Thumb />
  </ScrollArea.Scrollbar>
  <ScrollArea.Corner />
</ScrollArea.Root>`,
    props: [
      { name: 'orientation', type: "'horizontal' | 'vertical'", defaultValue: "'vertical'", description: 'Sets one Scrollbar axis.' },
      { name: 'keepMounted', type: 'boolean', defaultValue: 'false', description: 'Keeps a non-overflowing Scrollbar mounted.' },
      { name: 'Viewport.children', type: 'JSX.Element', defaultValue: '—', description: 'Provides native overflow content.' },
      { name: 'Scrollbar.class / style', type: 'value | state function', defaultValue: '—', description: 'Styles from overflow, scrolling, and dragging state.' },
    ],
    exampleTitle: 'Native overflow with custom scrollbar',
    exampleDescription: 'Viewport remains the real scroll container and Thumb mirrors its geometry.',
  }),
  separator: makeReference({
    Demo: SeparatorDemo,
    usageCode: `import { Separator } from 'wheel/components';

<Separator orientation="horizontal" />`,
    props: [
      { name: 'orientation', type: "'horizontal' | 'vertical'", defaultValue: "'horizontal'", description: 'Sets line direction and semantic orientation.' },
      { name: 'decorative', type: 'boolean', defaultValue: 'true', description: 'Hides a purely visual divider from assistive technology.' },
    ],
    exampleTitle: 'Visual and semantic boundaries',
    exampleDescription: 'Orientation and decorative intent remain explicit.',
  }),
  slider: makeReference({
    Demo: SliderDemo,
    usageCode: `import { Slider } from 'wheel/components';

<Slider.Root defaultValue={40} min={0} max={100}>
  <Slider.Control>
    <Slider.Track><Slider.Indicator /></Slider.Track>
    <Slider.Thumb aria-label="Volume" />
  </Slider.Control>
</Slider.Root>`,
    props: [
      { name: 'value', type: 'number | number[]', defaultValue: '—', description: 'Controls one value or a range.' },
      { name: 'defaultValue', type: 'number | number[]', defaultValue: 'min', description: 'Sets initial uncontrolled values.' },
      { name: 'onValueChange', type: '(value, details) => void', defaultValue: '—', description: 'Reports pointer and keyboard changes.' },
      { name: 'min / max / step', type: 'number', defaultValue: '0 / 100 / 1', description: 'Sets numeric bounds and increment.' },
      { name: 'orientation', type: "'horizontal' | 'vertical'", defaultValue: "'horizontal'", description: 'Sets geometry and keyboard direction.' },
      { name: 'disabled / readOnly', type: 'boolean', defaultValue: 'false', description: 'Blocks every thumb and track change.' },
      { name: 'name / form', type: 'string', defaultValue: '—', description: 'Submits scalar or repeated range values.' },
    ],
    exampleTitle: 'Pointer and keyboard range',
    exampleDescription: 'Track, indicator, and named Thumb share one normalized value scale.',
  }),
  switch: makeReference({
    Demo: SwitchDemo,
    usageCode: `import { Switch } from 'wheel/components';

<label>
  <Switch.Root defaultChecked name="notifications">
    <Switch.Thumb />
  </Switch.Root>
  Notifications
</label>`,
    props: [
      { name: 'checked', type: 'boolean', defaultValue: '—', description: 'Controls on or off state.' },
      { name: 'defaultChecked', type: 'boolean', defaultValue: 'false', description: 'Sets initial uncontrolled state.' },
      { name: 'onCheckedChange', type: '(checked, details) => void', defaultValue: '—', description: 'Reports requested toggles.' },
      { name: 'size', type: "'sm' | 'md'", defaultValue: "'md'", description: 'Sets track and Thumb geometry together.' },
      { name: 'status', type: "'success' | 'warning' | 'error'", defaultValue: '—', description: 'Adds a visual validation tone.' },
      { name: 'disabled / readOnly / required', type: 'boolean', defaultValue: 'false', description: 'Applies native switch constraints.' },
      { name: 'name / value / form', type: 'string', defaultValue: '—', description: 'Configures hidden checkbox submission.' },
      { name: 'uncheckedValue', type: 'string', defaultValue: '—', description: 'Submits an explicit off value.' },
      { name: 'inputRef', type: '(input) => void', defaultValue: '—', description: 'Receives the hidden native checkbox.' },
    ],
    exampleTitle: 'Labeled setting',
    exampleDescription: 'Native form state, switch semantics, and moving Thumb stay connected.',
  }),
  tabs: makeReference({
    Demo: TabsDemo,
    usageCode: `import { Tabs } from 'wheel/components';

<Tabs.Root defaultValue="overview">
  <Tabs.List>
    <Tabs.Tab value="overview">Overview</Tabs.Tab>
    <Tabs.Tab value="activity">Activity</Tabs.Tab>
    <Tabs.Indicator />
  </Tabs.List>
  <Tabs.Panel value="overview">Overview content</Tabs.Panel>
  <Tabs.Panel value="activity">Activity content</Tabs.Panel>
</Tabs.Root>`,
    props: [
      { name: 'value', type: 'string', defaultValue: '—', description: 'Controls the selected Tab value.' },
      { name: 'defaultValue', type: 'string', defaultValue: 'first enabled tab', description: 'Sets initial uncontrolled selection.' },
      { name: 'onValueChange', type: '(value, details) => void', defaultValue: '—', description: 'Reports requested Tab selection.' },
      { name: 'orientation', type: "'horizontal' | 'vertical'", defaultValue: "'horizontal'", description: 'Sets layout and arrow navigation.' },
      { name: 'activationDirection', type: "'automatic' | 'manual'", defaultValue: "'automatic'", description: 'Chooses focus or explicit activation.' },
      { name: 'loop', type: 'boolean', defaultValue: 'true', description: 'Wraps focus at the ends.' },
      { name: 'Tab.disabled', type: 'boolean', defaultValue: 'false', description: 'Skips one Tab during navigation.' },
      { name: 'Panel.keepMounted', type: 'boolean', defaultValue: 'false', description: 'Keeps inactive Panel content mounted and hidden.' },
    ],
    exampleTitle: 'Related views',
    exampleDescription: 'List, Tabs, Indicator, and Panels share stable value relationships.',
  }),
  toast: makeReference({
    Demo: ToastDemo,
    usageCode: `import { Toast } from 'wheel/components';

const toastManager = Toast.createToastManager();
toastManager.add({ title: 'Project saved', description: 'Your changes are live.' });

<Toast.Provider toastManager={toastManager}>
  <Toast.Portal>
    <Toast.Viewport>
      <For each={toasts()}>{(toast) => (
        <Toast.Root toast={toast}>
          <Toast.Content><Toast.Title /><Toast.Description /></Toast.Content>
          <Toast.Close>Close</Toast.Close>
        </Toast.Root>
      )}</For>
    </Toast.Viewport>
  </Toast.Portal>
</Toast.Provider>`,
    props: [
      { name: 'toastManager', type: 'ToastManager', defaultValue: 'created manager', description: 'Owns queue, updates, and dismissal.' },
      { name: 'timeout', type: 'number', defaultValue: '5000', description: 'Sets auto-dismiss duration before pause rules.' },
      { name: 'limit', type: 'number', defaultValue: '3', description: 'Limits visible queue items.' },
      { name: 'toast', type: 'ToastObject', defaultValue: '—', description: 'Connects one rendered Root to manager state.' },
      { name: 'swipeDirection', type: "'up' | 'right' | 'down' | 'left'", defaultValue: 'viewport edge', description: 'Sets pointer dismissal direction.' },
      { name: 'Close.children', type: 'JSX.Element', defaultValue: '—', description: 'Provides a named dismissal control.' },
    ],
    exampleTitle: 'Managed status queue',
    exampleDescription: 'Manager state, viewport, content, action, close, timeout, and swipe stay coordinated.',
  }),
  toolbar: makeReference({
    Demo: ToolbarDemo,
    usageCode: `import { Toolbar } from 'wheel/components';

<Toolbar.Root aria-label="Editor formatting">
  <Toolbar.Button>Bold</Toolbar.Button>
  <Toolbar.Button>Italic</Toolbar.Button>
  <Toolbar.Separator />
  <Toolbar.Link href="/help">Help</Toolbar.Link>
</Toolbar.Root>`,
    props: [
      { name: 'orientation', type: "'horizontal' | 'vertical'", defaultValue: "'horizontal'", description: 'Sets layout and arrow keys.' },
      { name: 'loop', type: 'boolean', defaultValue: 'true', description: 'Wraps focus at the ends.' },
      { name: 'disabled', type: 'boolean', defaultValue: 'false', description: 'Blocks all descendant Toolbar controls.' },
      { name: 'Button.disabled', type: 'boolean', defaultValue: 'false', description: 'Skips one control during navigation.' },
      { name: 'Link.href', type: 'string', defaultValue: '—', description: 'Preserves native link navigation.' },
    ],
    exampleTitle: 'Mixed compact controls',
    exampleDescription: 'Buttons, links, inputs, and separators share one roving focus scope.',
  }),
  tooltip: makeReference({
    Demo: TooltipDemo,
    usageCode: `import { Tooltip, IconButton } from 'wheel/components';

<Tooltip.Root>
  <Tooltip.Trigger as={IconButton} label="Archive" icon={<ArchiveIcon />} />
  <Tooltip.Portal>
    <Tooltip.Positioner sideOffset={4}>
      <Tooltip.Popup>Archive project</Tooltip.Popup>
    </Tooltip.Positioner>
  </Tooltip.Portal>
</Tooltip.Root>`,
    props: [
      ...controlledOpenProps.slice(0, 3),
      { name: 'delay', type: 'number', defaultValue: 'Provider value', description: 'Waits for keyboard focus or pointer intent.' },
      { name: 'closeDelay', type: 'number', defaultValue: 'Provider value', description: 'Controls delay-group travel.' },
      { name: 'trackCursorAxis', type: "'none' | 'x' | 'y' | 'both'", defaultValue: "'none'", description: 'Optionally anchors to pointer movement.' },
      ...popupPositionProps,
    ],
    exampleTitle: 'Supplemental action label',
    exampleDescription: 'The Trigger keeps its own name while Tooltip adds brief visible help.',
  }),
};
