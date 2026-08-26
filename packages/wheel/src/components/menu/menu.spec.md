# Menu behavior specification

- Menu exposes a temporary list of actions from a Trigger.
- Root composes Trigger, Portal, Positioner, Popup, Arrow, Group, GroupLabel, Item, LinkItem, CheckboxItem, RadioGroup, RadioItem, Submenu, Separator, and indicator parts.
- Trigger exposes expanded state and popup ownership.
- Opening by keyboard focuses the first or last enabled item based on the opening key.
- Arrow keys, Home, End, and typeahead move focus among enabled items.
- Enter and Space activate actions. Escape closes the deepest open level and restores focus.
- Pointer hover highlights items without activation. Pointer release activates only the intended item.
- Item activation closes the menu tree unless the item type or caller explicitly keeps it open.
- Links preserve navigation semantics. Checkbox and radio items preserve menuitem selection semantics.
- Destructive intent remains explicit and never changes keyboard behavior.
- Submenus use pointer intent, correct arrow direction, independent collision, and nested focus ownership.
- `sm`, `md`, and `lg` change popup and every row slot together.
- Disabled items remain visible, are skipped by navigation, and never activate.
- Popup entry is immediate. Every closing level uses only the shared 100 ms fade-out.
- Browser proof covers pointer, keyboard, typeahead, links, selection items, submenus, collision, RTL, and repeated openings.
