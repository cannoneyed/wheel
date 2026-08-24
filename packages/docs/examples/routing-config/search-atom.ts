import { Service } from 'wheel/core';
import type { RouterService } from 'wheel/router';
import { z } from 'zod';

import { appRouter, type Routes } from './router';

/** Filter state that lives in the URL. Nothing that reads it knows that. */
export class IssueFilterService extends Service {
  private readonly router = this.service(appRouter.Service) as RouterService<Routes>;

  /** Bound to `?q=`. Read and write it like any other atom. */
  readonly query = this.router.searchAtom('q', z.string().default(''));

  /** Bound to `?page=`, decoded as a number without `z.coerce`. */
  readonly page = this.router.searchAtom('page', z.number().int().min(1).default(1));

  /** Clear the filter — writes the atoms, which clears the URL. */
  readonly reset = this.action(() => {
    this.query.set('');
    this.page.set(1);
  }, 'reset');
}
