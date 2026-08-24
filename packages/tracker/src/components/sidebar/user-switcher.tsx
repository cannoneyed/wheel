/**
 * Per-tab actor picker — the multi-client demo mechanism. Not auth.
 */
import { For, Show } from 'solid-js';
import { componentRoot, connect, view } from 'wheel/core';

import { TeamService } from '../../services/team-service';
import { UserService } from '../../services/user-service';
import styles from './user-switcher.module.css';

const connectUserSwitcher = connect('UserSwitcher', (c) => {
  const teamService = c.service(TeamService);
  const userService = c.service(UserService);
  return view(
    {
      users: teamService.users,
      actorId: userService.actorId,
      actor: () => teamService.user(userService.actorId.get())
    },
    { switchTo: userService.switchTo }
  );
});

/** Avatar + select for the tab's acting user. */
export function UserSwitcher() {
  const state = connectUserSwitcher({});
  return (
    <div use:componentRoot class={styles.switcher}>
      <Show
        when={state.actor}
        fallback={<span class={styles.hint}>Pick a user to act as:</span>}
      >
        {(actor) => (
          <span class={styles.avatar} style={{ background: actor().avatarColor }}>
            {actor().initials}
          </span>
        )}
      </Show>
      <select
        value={state.actorId}
        onChange={(event) => state.switchTo(event.currentTarget.value)}
      >
        <option value="" disabled>
          Acting as…
        </option>
        <For each={state.users}>{(user) => <option value={user.id}>{user.name}</option>}</For>
      </select>
    </div>
  );
}
