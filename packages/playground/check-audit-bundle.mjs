import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const file = fileURLToPath(new URL('dist-audit/audit.html', import.meta.url));
const html = readFileSync(file, 'utf8');
const countTags = (tagName, closing = false) => {
  const slash = closing ? '\\/' : '';
  const attributes = closing ? '\\s*' : '(?:\\s[^<>]*?)?';
  return html.match(new RegExp(`<${slash}${tagName}${attributes}>`, 'gi'))?.length ?? 0;
};

const checks = [
  [countTags('script'), 1, 'script start tags'],
  [countTags('script', true), 1, 'script end tags'],
  [countTags('style'), 1, 'style start tags'],
  [countTags('style', true), 1, 'style end tags'],
];

for (const [actual, expected, label] of checks) {
  if (actual !== expected) {
    throw new Error(`Component audit bundle has ${actual} ${label}; expected ${expected}.`);
  }
}

if (/<script[^>]+\bsrc=/i.test(html) || /<link[^>]+\bhref=/i.test(html)) {
  throw new Error('Component audit bundle still references an external asset.');
}

console.log(`audit bundle: passed (${Buffer.byteLength(html)} bytes)`);
