/**
 * Markdown-syntax elements compile to `_components.h1`-style references whose
 * MDX defaults are plain strings ("h1"). Solid's createComponent requires
 * functions, so every intrinsic tag MDX may emit gets a Dynamic wrapper —
 * without this map the first heading throws "Comp is not a function".
 *
 * Passed to every page as the `components` prop; MDX spreads it over its
 * string defaults.
 */
import { Dynamic } from 'solid-js/web';
import type { JSX } from 'solid-js';

const INTRINSIC_TAGS = [
  'a', 'blockquote', 'br', 'code', 'del', 'div', 'em', 'figcaption', 'figure',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'img', 'input', 'li', 'ol', 'p',
  'pre', 'section', 'span', 'strong', 'sup', 'table', 'tbody', 'td', 'th',
  'thead', 'tr', 'ul'
] as const;

export const MDX_COMPONENTS = Object.fromEntries(
  INTRINSIC_TAGS.map((tag) => [
    tag,
    (props: JSX.HTMLAttributes<HTMLElement>) => <Dynamic component={tag} {...props} />
  ])
);
