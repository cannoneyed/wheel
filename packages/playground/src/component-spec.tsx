/* eslint-disable wheel/require-view-root -- ComponentAudit owns this nested documentation surface. */
import { Marked } from 'marked';
import type { JSX } from 'solid-js';
import { Code } from 'wheel/components';

import { highlightSyntax, syntaxLanguage } from './syntax-highlight';

const specModules = import.meta.glob<string>('../../wheel/src/components/**/*.spec.md', {
  eager: true,
  import: 'default',
  query: '?component-spec',
});

const markdown = new Marked({
  gfm: true,
  renderer: {
    code: ({ text, lang }) => {
      const language = syntaxLanguage(lang);
      return `<pre class="wheel-CodeBlock" data-slot="code-block" data-language="${language}"><code class="wheel-Code" data-slot="code" data-language="${language}">${highlightSyntax(text, language)}</code></pre>`;
    },
    codespan: ({ text }) =>
      `<code class="wheel-Code" data-slot="code" data-language="typescript">${highlightSyntax(text, 'typescript')}</code>`,
    html: () => '',
  },
});

export interface ComponentSpec {
  readonly source: string;
  readonly sourcePath: string;
}

const specsBySlug = new Map<string, ComponentSpec>();
for (const [sourcePath, source] of Object.entries(specModules)) {
  const filename = sourcePath.split('/').at(-1);
  const slug = filename?.replace(/\.spec\.md$/, '');
  if (!slug || slug === filename) {
    continue;
  }
  specsBySlug.set(slug, {
    source,
    sourcePath: sourcePath.replace('../../wheel/', 'packages/wheel/'),
  });
}

/** Returns the Markdown behavior contract bundled for a component page. */
export function componentSpec(slug: string): ComponentSpec | undefined {
  return specsBySlug.get(slug);
}

/** Renders one component contract or records that its tracker work remains open. */
export function ComponentSpecPage(props: {
  readonly componentName: string;
  readonly slug: string;
  readonly spec?: ComponentSpec | undefined;
}): JSX.Element {
  return (
    <section class="component-spec" data-testid="component-spec-panel">
      {props.spec ? (
        <>
          <div class="component-spec__source">
            <span>Source</span>
            <Code
              code={props.spec.sourcePath}
              highlightedHtml={highlightSyntax(props.spec.sourcePath, 'plaintext')}
              language="plaintext"
            />
          </div>
          <article
            class="component-spec__markdown"
            innerHTML={markdown.parse(props.spec.source, { async: false })}
          />
        </>
      ) : (
        <div class="component-spec__missing">
          <span>Spec not written</span>
          <h2>{props.componentName} has no Markdown contract yet.</h2>
          <p>
            The audit tracker remains the source for this work until{' '}
            <Code
              code={`${props.slug}.spec.md`}
              highlightedHtml={highlightSyntax(`${props.slug}.spec.md`, 'plaintext')}
              language="plaintext"
            />{' '}
            is added.
          </p>
        </div>
      )}
    </section>
  );
}
