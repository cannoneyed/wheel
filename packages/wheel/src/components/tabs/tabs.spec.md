# Tabs behavior specification

- Tabs switch between related panels while keeping one Tab List in the page flow.
- Root coordinates List, Tab, Indicator, and Panel parts through stable values.
- `value`, `defaultValue`, and `onValueChange` support controlled and uncontrolled selection.
- Tab List exposes tablist semantics and a visible or explicit accessible name when more than one list exists.
- Each Tab names one Panel through `aria-controls`; each Panel points back through `aria-labelledby`.
- Automatic activation selects on focus. Manual activation waits for `Enter` or `Space`.
- Arrow keys move focus according to orientation and text direction. `Home` and `End` reach the ends.
- Tabbing enters the selected Tab and then moves into the active Panel.
- Disabled Tabs are skipped by pointer and keyboard navigation.
- Unmounted-panel mode removes inactive content. Keep-mounted mode hides it without leaving interactive descendants focusable.
- `sm`, `md`, and `lg` change tab height and type together. Hug and fill layouts preserve the same focus behavior.
- Overflow moves excess tabs into Tab Menu without changing their value, order, or selected state.
- Selection and Panel content appear immediately. Indicator may move with shared state motion, never entry motion.
- Forced colors preserves selected state and focus independent of the Indicator color.
- Browser proof covers both activation modes, every key, RTL, controlled selection, overflow, deletion, and focus restoration.
