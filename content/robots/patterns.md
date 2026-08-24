# Patterns

Human page: [Patterns](../docs/patterns.mdx). API: [`wheel/kit`](api/kit.md).

## System pattern

Global UI uses one service for inspectable state and one mounted system for DOM behavior.

| Surface | Declaration | Service | System |
| --- | --- | --- | --- |
| Context menu | `use:contextMenu` or `ContextMenu` | `ContextMenuService` | `ContextMenuSystem` |
| Dialog | `Dialog`, `openDialog`, `confirm`, `alert` | `DialogService` | `DialogSystem` |
| Keyboard | binding registration | `KeyboardService` | `KeyboardSystem` |
| Command palette | command registration | `CommandPaletteService` | `CommandPaletteSystem` |
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
