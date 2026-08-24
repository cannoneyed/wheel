/**
 * Shared section scaffolding: a headline and free-form children. Keeps every
 * section's skeleton identical so the scroll reads as one document.
 *
 * Sections used to open with a "Fig. 03 | SYNC ENGINE" eyebrow. It was a
 * caption device on prose that is not a figure, and the numbers had already
 * drifted out of order (two 02s, then a jump to 09) with nothing to catch it —
 * a counter maintained by hand in eight separate call sites. The headline says
 * what the section is about, which is the whole job.
 */
import type { Component, JSX } from 'solid-js';
import { viewRoot } from 'wheel/core';

import { MDX_COMPONENTS } from '../../../docs/src/mdx-components';

/** Narrative section: a headline and its content. */
export function Section(props: { title: string; id?: string; children: JSX.Element }) {
  return (
    <section
      use:viewRoot={{ name: 'Section', props }}
      class="section"
      id={props.id}
      data-testid="section"
    >
      <h2>{props.title}</h2>
      {props.children}
    </section>
  );
}

/**
 * Renders one snippet .mdx module (a single fenced code block) through the
 * shared docs MDX pipeline — identical shiki highlighting to the /docs pages.
 */
export function Snippet(props: {
  of: Component<{ components?: Record<string, unknown> }>;
}) {
  return <props.of components={MDX_COMPONENTS} />;
}
