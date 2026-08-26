# Avatar behavior specification

- Avatar represents a person, team, service, or other named identity.
- Root composes Image and Fallback without owning identity data.
- Image uses the caller's native image props and does not expose broken-image chrome.
- Fallback appears when the image is missing, still loading, or fails.
- Fallback initials remain caller-owned. Avatar never guesses a person's name.
- Image success replaces the fallback immediately. Avatar never fades the image in.
- `xs`, `sm`, `md`, `lg`, and `xl` sizes keep image, initials, status, and focus geometry aligned.
- Circle, rounded-square, and square shapes use one shared size contract.
- Optional status uses a visible mark plus an accessible label when status conveys information.
- Status supports neutral, online, busy, away, and offline meanings without relying on color alone.
- Interactive avatars use Button or Link semantics. A non-interactive Avatar never receives a tab stop.
- Tooltip content may expand an interactive avatar's accessible name but cannot replace that name.
- Decorative images use an empty alternative. Meaningful identity images use the identity name.
- Forced colors preserve the avatar boundary and status mark. High zoom does not clip initials.
- Browser proof covers load, error, source change, keyboard activation, and theme contrast.
