# ChatMessageBubble behavior specification

- Presents the readable surface for one chat message.
- Astryx family coverage: `ChatComposer`, `ChatComposerDrawer`, `ChatComposerInput`, `ChatComposerTokenElement`, `ChatDictationButton`, `ChatSendButton`; `ChatLayout`, `ChatLayoutScrollButton`; `ChatMessage`, `ChatMessageBubble`, `ChatMessageList`, `ChatMessageMetadata`, `ChatSystemMessage`, `ChatTokenizedText`, `ChatToolCalls`; compact/balanced/spacious densities and delivery states
- Wheel family contract: Add as a later product-pattern layer. Build it from Avatar, Button, Token, List, Scroll Area, and Field instead of embedding new primitives.
- The component renders its semantic default element and supports `as` and `asChild` composition without an extra wrapper.
- `sm`, `md`, and `lg` use the shared control and type scale when size changes the component.
- Compact density is the default. Balanced and spacious density increase token-based gaps without changing behavior.
- Neutral, accent, info, success, warning, and error tones use shared semantic tokens and preserve readable contrast.
- Variant props change presentation without changing roles, labels, value ownership, or event order.
- Disabled state remains readable, exposes `aria-disabled`, and blocks native activation where the rendered element supports it.
- The component does not add keyboard stops or interactive roles unless its rendered content requires them.
- Content order remains stable for screen readers, zoom, and right-to-left layouts.
- Mounted content appears on the first frame. The component never fades, slides, or scales in.
- Dismissed content may use the shared 100 ms exit-only motion. Reduced motion removes that exit.
- Forced colors preserve boundaries, focus, current state, and status without relying on color alone.
- Unit proof covers semantic defaults, composition props, design attributes, disabled state, and state callbacks.
- Browser proof covers the complete pointer and keyboard sequence, responsive layout, right-to-left layout, and repeated use.
