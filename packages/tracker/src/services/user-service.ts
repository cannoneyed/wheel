/**
 * The current actor (per-tab, from the user switcher). Not auth — the
 * documented trust model: identity is a param, never enforced.
 */
import { Service } from 'wheel/core';
import { currentActorId, switchActor } from '../utils/tracker-client';

/** Who this tab is acting as. */
export class UserService extends Service {
         /** Identity that survives minification (see require-service-name). */
         static override serviceName = 'UserService';

  /**
   * The current actor's userId ('' until picked → shell shows the switcher).
   * Connect directly (`view({ actorId: svc.actorId })`); read `.get()` elsewhere.
   */
  readonly actorId = this.atom<string>(currentActorId(), 'actorId');

  /** Switch actor (persists per-tab, reloads for clean re-subscription). */
  readonly switchTo = this.action((userId: string) => {
    switchActor(userId);
  }, 'switchTo');
}
