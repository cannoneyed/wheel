# Slider behavior specification

- Slider chooses one value or a range within numeric bounds.
- Root coordinates Control, Track, Indicator, Thumb, and Value parts.
- `value`, `defaultValue`, and `onValueChange` support controlled and uncontrolled scalar or range values.
- Pointer press moves the nearest Thumb and starts a drag. Pointer capture keeps the drag active outside the track.
- Arrow keys step the focused Thumb. Page keys use the large step. Home and End reach bounds.
- Horizontal direction follows text direction. Vertical Up always increases and Down decreases.
- Range thumbs cannot cross unless the caller enables crossing. Minimum distance remains enforced.
- Each Thumb exposes slider semantics, current value, bounds, orientation, and a distinct accessible name.
- Decimal steps avoid visible binary rounding errors.
- Marks and labels remain caller-owned and align to the normalized value scale.
- `sm`, `md`, and `lg` change track and thumb geometry while retaining a usable hit target.
- Neutral, success, warning, and error status pair visual tone with field messages.
- Disabled blocks every input. Read-only permits focus and value inspection without changes.
- Initial position appears immediately. Drag and value changes use shared state motion only when not actively dragging.
