/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/no-raw-console -- This file is the component layer's development error boundary. */
let set: Set<string>;
if (process.env.NODE_ENV !== 'production') {
  set = new Set<string>();
}

export function error(...messages: string[]) {
  if (process.env.NODE_ENV !== 'production') {
    const messageKey = messages.join(' ');
    if (!set.has(messageKey)) {
      set.add(messageKey);
      console.error(`Base UI Solid: ${messageKey}`);
    }
  }
}

export function reset() {
  set?.clear();
}
