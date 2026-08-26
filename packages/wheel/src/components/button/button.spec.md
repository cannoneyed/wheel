# Button specification

Button starts an action, submits or resets a form, or follows a link when navigation uses button styling.

## Contract

- `Button` renders a native `button` unless `href`, `as`, or `asChild` selects another element.
- A native button defaults to `type="button"` and forwards `submit`, `reset`, `name`, `value`, and `form` behavior.
- `href` renders an anchor by default and preserves native link actions such as opening a new tab.
- A custom non-button element receives button semantics and Enter and Space activation when `nativeButton={false}`.
- `children` provides the visible label. The button keeps that label in the accessibility tree while loading.
- `icon` renders before the label. `endContent` renders after the label.
- `Button` supports `primary`, `secondary`, `ghost`, and `destructive` variants. The default is `secondary`.
- `Button` supports `sm`, `md`, and `lg` sizes. The default `md` size stays 28 pixels high for dense application layouts.
- Each variant and size appears as `data-variant` and `data-size` for inspection and application styling.
- The stable identity is `wheel-Button` with `data-slot="button"`.
- `class` and `style` accept state functions. State exposes `disabled`, `loading`, `variant`, and `size`.

## Activation and state

- Pointer click, Enter, and Space run one activation for a native button.
- `onClick` runs before `clickAction`. Calling `preventDefault()` in `onClick` skips `clickAction`.
- `clickAction` accepts synchronous work or a promise.
- A pending `clickAction` sets `data-loading` and `aria-busy="true"` immediately.
- A non-interruptible pending action blocks repeat activation until the latest action settles.
- `interruptible` keeps a pending action interactive. A later activation starts new work, and the newest action owns the loading state.
- `interruptible` does not cancel an earlier promise because the promise API has no cancellation channel.
- Controlled `loading` always blocks activation, including when `interruptible` is true.
- Loading content remains mounted to prevent width changes. A spinner replaces it visually and stays hidden from assistive technology.
- A polite live status announces `Loading` when loading begins and clears when loading ends.
- A rejected action clears the loading state. The action owner remains responsible for handling its error.
- `disabled` blocks pointer and keyboard activation and sets `data-disabled`.
- A disabled native button uses the native `disabled` attribute unless `focusableWhenDisabled` is true.
- `focusableWhenDisabled` uses `aria-disabled="true"`, keeps the button in the tab order, and still blocks activation.
- A disabled link removes navigation and follows the same focus rule as a non-native button.

## Composition

- A `Button` inside `ButtonGroup` inherits the group size, variant, and disabled state unless it sets its own size or variant.
- A grouped button participates in one roving tab stop and remains a direct group member.
- A grouped button uses the group orientation for connected corners and separators.
- `asChild` gives the resolved props and state to the child render function. The child owns its visible content.
- `ref`, event handlers, ARIA attributes, data attributes, and form attributes reach the rendered element.

## Visual behavior

- `primary` uses the accent surface and accent foreground.
- `secondary` uses an elevated neutral surface, visible border, and low shadow.
- `ghost` uses a transparent resting surface.
- `destructive` uses the danger surface and a matching focus treatment.
- Hover, pressed, loading, and focus states never change the control dimensions.
- Hover and pressed states appear without an entry fade. Their removal uses the fast exit transition.
- The spinner may rotate, but no content fades in.
- Focus remains visible in light, dark, custom, forced-color, and high-contrast themes.
- Logical spacing and corners support right-to-left layouts.
- Reduced-motion mode removes state transition and spinner motion.

## Proof

- Unit tests cover element choice, form type, variants, sizes, content slots, disabled state, loading, action deduplication, interruption, state callbacks, and group inheritance.
- Browser tests cover pointer and keyboard activation, native link behavior, pending actions, repeat activation, and focus movement in a group.
- Catalog fixtures show every variant and size plus disabled, loading, icon, trailing content, link, and async states.
- Light, dark, and custom-theme screenshots cover the fixture at the catalog width.
