/** A TypeScript-shaped feature list with build-time-safe data from home.mdx. */
import { For } from 'solid-js';
import { viewRoot } from 'wheel/core';

export interface FeatureCodeItem {
  name: string;
  text: string;
}

export function FeatureCode(props: {
  filename: string;
  constant: string;
  items: FeatureCodeItem[];
}) {
  return (
    <figure
      use:viewRoot={{ name: 'FeatureCode', props }}
      class="feature-code"
      data-testid="feature-code"
    >
      <figcaption>{props.filename}</figcaption>
      <pre>
        <code role="list">
          <span class="feature-code-line">
            <span class="syntax-keyword">export const</span>{' '}
            <span class="syntax-variable">{props.constant}</span>{' '}
            <span class="syntax-punctuation">= {'{'}</span>
          </span>
          <For each={props.items}>
            {(item) => (
              <span class="feature-code-line feature-code-entry" role="listitem">
                <span class="syntax-property">{JSON.stringify(item.name)}</span>
                <span class="syntax-punctuation">: </span>
                <span class="syntax-string">{JSON.stringify(item.text)}</span>
                <span class="syntax-punctuation">,</span>
              </span>
            )}
          </For>
          <span class="feature-code-line">
            <span class="syntax-punctuation">{'}'}</span>{' '}
            <span class="syntax-keyword">as const</span>
            <span class="syntax-punctuation">;</span>
          </span>
        </code>
      </pre>
    </figure>
  );
}
