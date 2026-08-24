/**
 * The landing page's whole component vocabulary, in one import so `home.mdx`
 * opens with a single line. Four primitives, no per-section files: the copy
 * that used to live in nine TSX files is now MDX.
 */
export { Section, Snippet } from './section';
export { Hero, Ctas } from './hero';
export { AgentInstall } from './agent-install';
export { ItemList, DemoGrid, type ListItem } from './lists';
export { LiveDemo } from './live-demo';
