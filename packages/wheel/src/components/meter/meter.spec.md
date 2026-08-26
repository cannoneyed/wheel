# Meter behavior specification

- Meter displays a known scalar measurement within a fixed range. It does not represent task progress.
- Root exposes native meter semantics with current, minimum, maximum, low, high, and optimum values.
- Values outside the range clamp visually while the caller's value remains available to callbacks and labels.
- Label and Value parts may show a name and formatted value without duplicating the accessible name.
- The accessible name comes from a visible label or explicit ARIA label.
- `sm`, `md`, and `lg` sizes change track thickness and label spacing.
- Neutral, accent, success, warning, and error tones do not replace a textual meaning.
- Low, high, and optimum ranges may derive a semantic tone when the caller opts in.
- Zero-width and full-width indicators remain visible and stay inside the track.
- Value changes move the indicator with the shared state-motion token and do not delay updates.
- Initial render shows the final value immediately and never grows in from zero.
- Reduced motion applies the new width immediately. Forced colors preserves track and indicator contrast.
- Browser proof covers clamping, formatted values, semantic ranges, direction, zoom, and live value changes.
