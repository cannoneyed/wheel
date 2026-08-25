import { Service } from 'wheel/core';

export interface Card {
  readonly id: string;
  readonly title: string;
  readonly columnId: string;
}

export class BoardService extends Service {
         /** Identity that survives minification (see require-service-name). */
         static override serviceName = 'BoardService';

  readonly cards = this.atom<readonly Card[]>([], 'cards');
  readonly columns = this.atom<readonly string[]>([], 'columns');

  readonly remove = this.action((cardId: string) => {
    this.cards.set(this.cards.get().filter((card) => card.id !== cardId));
  });

  readonly moveToEnd = this.action((cardId: string, columnId: string) => {
    this.cards.update((draft) => {
      const card = draft.find((candidate) => candidate.id === cardId);
      if (card) {
        card.columnId = columnId;
      }
    });
  });
}
