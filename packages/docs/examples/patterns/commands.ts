import { Service, type ServiceContext } from 'wheel/core';
import { CommandService, type CommandContext } from 'wheel/kit';

import { BoardService } from './board-service';

/** The board's own context: what Wheel cannot know. */
interface BoardCtx extends CommandContext {
  readonly selected: readonly string[];
}

class BoardSelectionService extends Service {
  /** Identity that survives minification (see require-service-name). */
  static override serviceName = 'BoardSelectionService';

  readonly selected = this.atom<readonly string[]>([], 'selected');
}

/** Registers the board's commands and supplies their context. */
export class BoardCommandService extends Service {
  /** Identity that survives minification (see require-service-name). */
  static override serviceName = 'BoardCommandService';

  constructor(context: ServiceContext) {
    super(context);
    const board = this.service(BoardService);
    const selection = this.service(BoardSelectionService);
    // #region register
    const commands = this.service(CommandService);
    // Once per app: the fields every rule reads. Reactive reads keep lists live.
    this.addCleanup(commands.setContext(() => ({ selected: selection.selected.get() })));
    this.addCleanup(
      commands.register<BoardCtx>({
        id: 'cards.delete',
        title: (ctx) => (ctx.selected.length > 1 ? `Delete ${ctx.selected.length} cards` : 'Delete card'),
        group: 'Cards',
        keys: ['mod+backspace'],
        // Does it make sense here? False: not listed, and the key falls through.
        visible: () => board.cards.get().length > 0,
        // Can it run now? When it can't, say why. There is no bare `false`.
        enabled: (ctx) => (ctx.selected.length > 0 ? true : { reason: 'Select a card first' }),
        run: (ctx) => ctx.selected.forEach(board.remove)
      })
    );
    // #endregion register
  }
}
