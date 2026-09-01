/** The two workspace names used by local and backend-isolation proofs. */
export const SPOKE_WORKSPACES = ['acme', 'orbit'] as const;

/** Deterministic product seed for one isolated workspace database. */
export function spokeSeed(workspaceId: string): readonly string[] {
  if (workspaceId === 'acme') {
    return [
      `insert or ignore into members (id, name) values ('ada', 'Ada'), ('lin', 'Lin')`,
      `insert or ignore into channels (id, name, is_private, created_at) values
         ('channel_general', 'general', 0, 1730000000000),
         ('channel_leads', 'leads', 1, 1730000000001)`,
      `insert or ignore into channel_members (channel_id, member_id) values
         ('channel_general', 'ada'), ('channel_general', 'lin'), ('channel_leads', 'ada')`,
      `insert or ignore into messages (id, channel_id, author_id, body, created_at, edited_at) values
         ('message_acme_general', 'channel_general', 'ada', 'Welcome to Acme', 1730000000100, null),
         ('message_acme_private', 'channel_leads', 'ada', 'Acme launch is private', 1730000000200, null)`,
      `insert or ignore into channel_reads (channel_id, member_id, last_read_at) values
         ('channel_general', 'ada', 1730000000100), ('channel_general', 'lin', 0),
         ('channel_leads', 'ada', 1730000000200)`
    ];
  }
  if (workspaceId === 'orbit') {
    return [
      `insert or ignore into members (id, name) values ('max', 'Max')`,
      `insert or ignore into channels (id, name, is_private, created_at) values
         ('channel_general', 'general', 0, 1730000000000),
         ('channel_ops', 'ops', 1, 1730000000001)`,
      `insert or ignore into channel_members (channel_id, member_id) values
         ('channel_general', 'max'), ('channel_ops', 'max')`,
      `insert or ignore into messages (id, channel_id, author_id, body, created_at, edited_at) values
         ('message_orbit_general', 'channel_general', 'max', 'Welcome to Orbit', 1730000000100, null),
         ('message_orbit_private', 'channel_ops', 'max', 'Orbit operations only', 1730000000200, null)`,
      `insert or ignore into channel_reads (channel_id, member_id, last_read_at) values
         ('channel_general', 'max', 1730000000100), ('channel_ops', 'max', 1730000000200)`
    ];
  }
  throw new Error(`Unknown Spoke workspace: ${workspaceId}`);
}
