# Menubar behavior specification

- Menubar presents a persistent row of application menus.
- Root exposes menubar semantics and coordinates Trigger, Menu, item, submenu, group, selection, and separator parts.
- One enabled top-level Trigger is the sequential tab stop.
- Horizontal arrow keys move between top-level menus according to text direction.
- Down or Up opens the focused menu and selects its first or last enabled item.
- While one menu is open, moving to another Trigger opens its menu without leaving Menubar.
- Menu item keys follow Menu behavior. Escape closes the current menu and returns focus to its Trigger.
- Pointer hover may switch open menus only after a menu has been deliberately opened.
- Disabled Triggers and items remain visible and are skipped.
- Links, checkbox items, radio groups, destructive actions, and submenus preserve their own semantics.
- `sm`, `md`, and `lg` set top-level and popup density together.
- Menubar itself has no entry motion. Popups enter immediately and fade out for 100 ms.
- Forced colors preserves current Trigger, highlighted items, selected items, and focus.
- Browser proof covers all keys, pointer switching, RTL, nested menus, dynamic disabled state, and focus exit.
