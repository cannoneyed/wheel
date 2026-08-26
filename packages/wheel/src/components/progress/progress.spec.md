# Progress behavior specification

- Progress reports task completion. Meter remains the component for scalar measurements.
- Root exposes progressbar semantics, an accessible name, current value, minimum, and maximum.
- A null value means indeterminate progress and omits `aria-valuenow`.
- Determinate values clamp visually to the range.
- Track and Indicator parts stay composable. Value may render a caller-formatted label.
- `sm`, `md`, and `lg` sizes change track thickness and surrounding gaps.
- Neutral, accent, success, warning, and error tones pair color with nearby text or an accessible status.
- Initial determinate render displays the final position immediately and never grows in from zero.
- Later determinate changes use shared state motion without delaying the value announcement.
- Indeterminate motion stops under reduced motion and keeps a static visible indicator.
- Direction follows text direction where progress has directional meaning.
- Forced colors preserves track and indicator separation.
- Browser proof covers determinate, indeterminate, clamp, live changes, labels, reduced motion, and themes.
