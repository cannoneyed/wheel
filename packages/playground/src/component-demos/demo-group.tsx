/* eslint-disable wheel/require-view-root -- The catalog owns this fixture layout helper. */
import type { JSX } from 'solid-js';

/** Gives related controls one visible label inside a component stage. */
export function DemoGroup(props: {
  readonly title: string;
  readonly description?: string | undefined;
  readonly children: JSX.Element;
}): JSX.Element {
  return (
    <section class="component-demo-group" aria-label={props.title}>
      <header>
        <h3>{props.title}</h3>
        {props.description ? <p>{props.description}</p> : null}
      </header>
      <div class="button-family-row">{props.children}</div>
    </section>
  );
}
