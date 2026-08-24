/**
 * The two list shapes the landing page uses. Both take their rows as data from
 * `src/home.mdx`, so adding a battery or a demo card is a line of MDX.
 */
import { For } from 'solid-js';
import { viewRoot } from 'wheel/core';

/** One `name — text` row; the shape of both the batteries and omissions lists. */
export type ListItem = { name: string; text: string };

/** A `name — text` bullet list. `variant` picks the stylesheet class. */
export function ItemList(props: {
  variant: 'battery-list' | 'omission-list';
  items: ListItem[];
}) {
  return (
    <ul use:viewRoot={{ name: 'ItemList', props }} class={props.variant} data-testid={props.variant}>
      <For each={props.items}>
        {(item) => (
          <li>
            <strong>{item.name}</strong> — {item.text}
          </li>
        )}
      </For>
    </ul>
  );
}

/** The card grid linking out to the live demos. */
export function DemoGrid(props: { cards: Array<{ name: string; text: string; href: string }> }) {
  return (
    <div use:viewRoot={{ name: 'DemoGrid', props }} class="demo-grid" data-testid="demo-grid">
      <For each={props.cards}>
        {(card) => (
          // wheel-raw-anchor: the demos embed is a separate app on a separate
          // base path — a full page load is the correct behavior.
          <a class="demo-card" href={card.href}>
            <strong>{card.name}</strong>
            <span>{card.text}</span>
          </a>
        )}
      </For>
    </div>
  );
}
