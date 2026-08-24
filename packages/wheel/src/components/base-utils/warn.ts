/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/no-raw-console -- This file is the component layer's development warning boundary. */
let set: Set<string>;
if (process.env.NODE_ENV !== 'production') {
  set = new Set<string>();
}

export function warn(...messages: string[]) {
  if (process.env.NODE_ENV !== 'production') {
    const messageKey = messages.join(' ');
    if (!set.has(messageKey)) {
      set.add(messageKey);
      console.warn(`Base UI Solid: ${messageKey}`);
    }
  }
}

export function warnEveryTime(...messages: string[]) {
  if (process.env.NODE_ENV !== 'production') {
    console.warn(`Base UI Solid: ${messages.join(' ')}`);
  }
}
