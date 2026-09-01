/**
 * Presence: who is viewing an issue and who is typing a comment.
 * Ephemeral by design — rides the client's presence channel, never touches a
 * table, and a lost update is not an error.
 *
 * State shape on the wire: { userId, issueId, typing } — one record per
 * client (tab). The same USER in two tabs shows once (deduped by userId).
 */
import { SyncService, presence, t } from 'wheel/sync';
import { TeamService, type User } from './team-service';
import { UserService } from './user-service';

/** The typed presence contract — one form for send (validated) and read (peers). */
const trackerPresence = presence({
  name: 'tracker',
  state: t.object({
    userId: t.string(),
    issueId: t.string().nullable(),
    typing: t.boolean()
  })
});

type PresenceState = {
  readonly userId: string;
  readonly issueId: string | null;
  readonly typing: boolean;
};

/** Publishes this tab's presence and reads peers'. */
export class PresenceService extends SyncService {
  /** Identity that survives minification (see require-service-name). */
  static override serviceName = 'PresenceService';

  private readonly userService = this.service(UserService);
  private readonly teamService = this.service(TeamService);
  private readonly current = this.field<PresenceState>({ userId: '', issueId: null, typing: false });

  private publish(next: Partial<PresenceState>): void {
    const current = { ...this.current.get(), userId: this.userService.actorId.get(), ...next };
    this.current.set(current);
    this.client.setPresence(trackerPresence, current.issueId === null ? null : { ...current });
  }

  /** Declare which issue this tab is viewing (null on leave). */
  readonly setViewing = this.action((issueId: string | null) => {
    this.publish({ issueId, typing: false });
  }, 'setViewing');

  /** Declare typing state in the comment composer. */
  readonly setTyping = this.action((typing: boolean) => {
    if (this.current.get().issueId !== null) this.publish({ typing });
  }, 'setTyping');

  // Peer reads ride the client change channel via clientReadFor (presence
  // events notify the client); memoized per issue and named in the debug panel.
  private readonly peersOn = this.clientReadFor((issueId: string): readonly PresenceState[] => {
    const states: PresenceState[] = [];
    // `valid` peers are already typed to the presence shape; a peer on a drifted
    // schema surfaces in `.failures` (not our concern here — we just skip it).
    for (const peer of this.client.peers(trackerPresence).valid.values()) {
      if (peer.issueId === issueId && peer.userId !== '') {
        states.push(peer);
      }
    }
    return states;
  }, 'peersOn');

  /** Distinct userIds currently viewing an issue (self's other tabs included, self-tab excluded by the client). */
  readonly viewers = this.computedFor(
    (issueId: string): readonly string[] =>
      [...new Set(this.peersOn(issueId).map((peer) => peer.userId))].filter(
        (userId) => userId !== this.userService.actorId.get()
      ),
    'viewers'
  );

  /** Distinct userIds typing a comment on an issue right now. */
  readonly typers = this.computedFor(
    (issueId: string): readonly string[] =>
      [
        ...new Set(this.peersOn(issueId).filter((peer) => peer.typing).map((peer) => peer.userId))
      ].filter((userId) => userId !== this.userService.actorId.get()),
    'typers'
  );

  /** Viewer user rows (avatars for the detail header). */
  readonly viewerUsers = this.computedFor(
    (issueId: string): readonly User[] =>
      this.viewers(issueId).flatMap((userId) => this.teamService.user(userId) ?? []),
    'viewerUsers'
  );

  /** Typing user rows ("Grace is typing…"). */
  readonly typerUsers = this.computedFor(
    (issueId: string): readonly User[] =>
      this.typers(issueId).flatMap((userId) => this.teamService.user(userId) ?? []),
    'typerUsers'
  );
}
