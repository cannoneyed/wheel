# Avatar behavior specification

- Avatar represents a person, team, service, or other named identity.
- Root composes Image and Fallback without owning identity data.
- Image uses the caller's native image props and does not expose broken-image chrome.
- Fallback appears when the image is missing, still loading, or fails.
- Fallback initials remain caller-owned. Avatar never guesses a person's name.
- Image success replaces the fallback immediately. Avatar never fades the image in.
- `xs`, `sm`, `md`, `lg`, and `xl` sizes keep image, initials, and focus geometry aligned.
- Circle, rounded-square, and square shapes use one shared size contract.
- Interactive avatars use Button or Link semantics. A non-interactive Avatar never receives a tab stop.
- Tooltip content may expand an interactive avatar's accessible name but cannot replace that name.
- Decorative images use an empty alternative. Meaningful identity images use the identity name.
- Forced colors preserve the avatar boundary. High zoom does not clip initials.
