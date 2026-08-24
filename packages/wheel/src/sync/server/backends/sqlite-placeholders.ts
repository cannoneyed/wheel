/**
 * Rewrite Wheel SQL tag placeholders to SQLite positional placeholders.
 * String literals stay unchanged, including escaped single quotes.
 */
export function toSqlitePlaceholders(text: string): string {
  let out = '';
  let inString = false;
  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index]!;
    if (inString) {
      out += ch;
      if (ch === "'") {
        if (text[index + 1] === "'") {
          out += "'";
          index += 1;
        } else {
          inString = false;
        }
      }
      continue;
    }
    if (ch === "'") {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === '$' && text[index + 1] !== undefined && /[0-9]/.test(text[index + 1]!)) {
      let end = index + 1;
      while (end < text.length && /[0-9]/.test(text[end]!)) end += 1;
      out += '?';
      index = end - 1;
      continue;
    }
    out += ch;
  }
  return out;
}
