import { Service } from 'wheel/core';

interface Card {
  readonly id: string;
  readonly tags: readonly string[];
}

export class BoardService extends Service {
         /** Identity that survives minification (see require-service-name). */
         static override serviceName = 'BoardService';

  readonly cards = this.atom<readonly Card[]>([], 'cards');
  readonly filter = this.atom<string | null>(null, 'filter');
  readonly selected = this.atom<string | null>(null, 'selected');

  readonly cardById = this.computedFor((id: string) =>
    this.cards.get().find((card) => card.id === id)
  );

  readonly visible = this.computed(() => {
    const filter = this.filter.get();
    return filter
      ? this.cards.get().filter((card) => card.tags.includes(filter))
      : this.cards.get();
  });

  // Both writes land in one batch, so readers re-run once.
  readonly focus = this.action((cardId: string) => {
    this.selected.set(cardId);
    this.filter.set(null);
  });
}
