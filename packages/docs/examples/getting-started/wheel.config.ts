import { defineWheelConfig } from 'wheel/core';

// App-wide settings for Wheel's global systems. Every field is optional;
// an empty config keeps every default.
export default defineWheelConfig({
  // mod+k inserts a link in this app, so only mod+shift+p opens the palette.
  commandPalette: { openKeyCommand: 'mod+shift+p' },
  // Frame geometry is saved under this app's own localStorage prefix.
  layout: { storagePrefix: 'todos.layout' }
});
