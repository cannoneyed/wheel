/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
export function stringifyLocale(locale?: Intl.LocalesArgument): string {
  if (Array.isArray(locale)) {
    return locale.map((value) => stringifyLocale(value)).join(',');
  }

  if (locale == null) {
    return '';
  }

  return String(locale);
}
