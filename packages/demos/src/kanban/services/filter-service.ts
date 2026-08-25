/**
 * The filter surface for the board: a thin projection service over
 * BoardService's tag filter. The filter VALUE lives in BoardService; this is
 * the one shape the filter bar knows — and the one service it fakes in
 * sandboxes.
 */
import { Service } from 'wheel/core';
import { BoardService } from './board-service';

/** Cherry-picked read-only filter state plus the composed filter actions. */
export class FilterService extends Service {
         /** Identity that survives minification (see require-service-name). */
         static override serviceName = 'FilterService';

  // A FIELD initializer, not a constructor assignment. Every field initializer
  // runs before the constructor body, and `computed` evaluates its function
  // immediately — so a dependency assigned in the constructor is still
  // `undefined` when the computed below first runs. The `no-early-field-read`
  // lint rule enforces this.
  private readonly boardService = this.service(BoardService);

  readonly tags = this.computed((): readonly string[] => this.boardService.tags());
  readonly active = this.computed((): string | null => this.boardService.tagFilter.get());
  readonly apply = (tag: string): void => this.boardService.setTag(tag);
  readonly clear = (): void => this.boardService.setTag(null);
}
