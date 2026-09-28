# Patterns

Human page: [Patterns](../docs/patterns.mdx). API: [`wheel/kit`](api/kit.md).

## System pattern

Global UI uses one service for inspectable state and one mounted system for DOM behavior.

| Surface | Declaration | Service | System |
| --- | --- | --- | --- |
| Context menu | `use:contextMenu` or `ContextMenu` | `ContextMenuService` | `ContextMenuSystem` |
| Dialog | `Dialog`, `openDialog`, `confirm`, `alert` | `DialogService` | `DialogSystem` |
| Keyboard | binding registration | `KeyboardService` | `KeyboardSystem` |
| Commands | `CommandService.register` | `CommandService` | read by keys, palette, menus |
| Command palette | viewer over `CommandService` (`registerCommand` adapter) | `CommandPaletteService` | `CommandPaletteSystem` |
| Toast | service method | `ToastService` | `ToastSystem` |

`FocusService` provides shared focus scopes and overlay restoration.

## Declaration-site ownership

Context-menu directives and declarative dialogs capture the Solid owner where they are declared. Their DOM renders in a portal, but service context and local providers follow the captured owner.

Imperative custom dialogs render at root context because event handlers have no declaration owner.

## Registration

- Registration ids are unique inside one service context.
- Duplicate registration throws with both declaration sites.
- Cleanup removes only the registration that created it.
- Closed lazy surfaces mount no content.

## Commands

- One record per action: `CommandService.register({ id, title, keys, visible, enabled, checked, args, run })`.
- `visible(ctx)` false: not listed, key falls through. `enabled(ctx)` returns `true` or `{ reason }` (no bare `false`): listed dim with the reason, key consumed, reason toasted.
- `setContext((request) => appFields)` supplies app context; Wheel adds `focus`, `source`, `target`, `actor`.
- Every surface runs `execute(id, args, { source, target, actor })` → `{ ok: true }` or `{ ok: false, why: 'unknown' | 'hidden' | 'disabled' | 'cancelled' | 'failed' }`. Sync `run` finishes before `execute` returns.
- `onExecute(hook)` for undo grouping and telemetry. `listFor({ source: 'agent', actor })` is an agent's tool list.
- Missing required `args`: `failed` naming the field for `api`/`agent`; `setArgsPrompt` asks people.
- Keys become `KeyboardService` bindings (`command` field set). `shortcut` = `formatCombo` of the first displayed key. `menuItem(id, { target })` builds a `MenuAction`.
- `keyboard.conflicts()`: `same-scope` (bug), `gated`, `shadowed`.

## Menus from data

- `MenuService.defineTarget(target, slots, { label })` fixes slot order; `contribute({ target, slot, entry, order?, when? })` adds `{ command }`, `{ submenu: otherTarget, label }`, or `{ separator: true }`.
- `contributeItems({ target, instance?, slot, source, items })` adds runtime `MenuAction`s; disabled items without `disabledReason` are dropped.
- `levelFor(target, { subject, instance })` → `MenuLevel` (headless). Command entries come from `CommandService.menuItem` and run with `source: 'menu'`, `target: subject`, after the menu closes.
- Trigger: `use:contextMenu={{ id, target, subject?, instance?, label? }}`. JSX `menu` form unchanged.
- `<ContextMenuSystem submenus="auto" | "flyout" | "stacked" />`: same data, same keys (↑ ↓ → ← Enter Esc Home End).
- Shift+F10 / Menu key inside the trigger → `openAt` the focused element, first item focused. `ContextMenuService.openAt(id, element)` for custom bindings.

## Isolation tiers

1. Stub one connection shape.
2. Override service classes for a subtree.
3. Mount a real engine and client.

Choose the first tier that includes the behavior under test.

## Imperative runtime wrapper

- Keep live handles in fields or local variables.
- Keep serializable, inspectable state in atoms.
- Attach through an element-taking factory or directive.
- Use one documented effect to push reactive changes into the runtime.
- Route runtime events through actions.
- Use presence for high-frequency peer previews.
- Dispose all listeners and handles in Solid cleanup.

Reference implementations:

- [`packages/demos/src/editor`](../../packages/demos/src/editor)
- [`packages/demos/src/graph`](../../packages/demos/src/graph)
