/** The app that owns a behavior's primary browser proof. */
export type BehaviorApp = 'axle' | 'rounds' | 'chalk' | 'spoke';

/** The backend topology used by a behavior's primary browser proof. */
export type BehaviorBackend =
  | 'sqlite'
  | 'postgres'
  | 'do'
  | 'deployed-do'
  | 'two-node-postgres';

/** One required or stretch browser behavior. */
export interface BehaviorCatalogEntry {
  /** Stable cross-app behavior ID. */
  readonly id: string;
  /** User-visible or engine-visible result the browser must prove. */
  readonly description: string;
  /** The one app and backend responsible for the primary proof. */
  readonly primary: {
    readonly app: BehaviorApp;
    readonly backend: BehaviorBackend;
  };
  /** Delivery phase that must add the primary proof. */
  readonly phase: number;
  /** Stretch proofs do not block required coverage. */
  readonly stretch?: true;
}

/** The latest phase whose primary tags must exist in source. */
export const BEHAVIOR_COVERAGE_PHASE = 5;

/** The browser behavior contract for Wheel 0.2. */
export const BEHAVIOR_CATALOG = [
  {
    id: 'conv-basic',
    description: 'A mutation from client A reaches client B without reload.',
    primary: { app: 'axle', backend: 'sqlite' },
    phase: 2
  },
  {
    id: 'conv-order-only',
    description: 'An order-only server change updates every client.',
    primary: { app: 'chalk', backend: 'sqlite' },
    phase: 5
  },
  {
    id: 'conv-overlap',
    description: 'Releasing one of two overlapping queries keeps rows claimed by the other.',
    primary: { app: 'axle', backend: 'sqlite' },
    phase: 2
  },
  {
    id: 'conv-aggregate',
    description: 'A derived aggregate updates when a contributing row changes.',
    primary: { app: 'spoke', backend: 'sqlite' },
    phase: 6
  },
  {
    id: 'conv-external',
    description: 'An external write converges on every client.',
    primary: { app: 'spoke', backend: 'postgres' },
    phase: 7
  },
  {
    id: 'conv-empty',
    description: 'An empty query result keeps its scope and status.',
    primary: { app: 'rounds', backend: 'sqlite' },
    phase: 3
  },
  {
    id: 'cmd-optimistic',
    description: 'An optimistic write renders before server confirmation.',
    primary: { app: 'rounds', backend: 'sqlite' },
    phase: 3
  },
  {
    id: 'cmd-group-atomic',
    description: 'A group publishes once locally and reaches a peer as one change.',
    primary: { app: 'chalk', backend: 'sqlite' },
    phase: 5
  },
  {
    id: 'cmd-group-undo',
    description: 'A group undoes as one entry in reverse member order.',
    primary: { app: 'chalk', backend: 'sqlite' },
    phase: 5
  },
  {
    id: 'cmd-reject',
    description: 'A business rejection removes optimistic changes and restores confirmed rows.',
    primary: { app: 'rounds', backend: 'sqlite' },
    phase: 3
  },
  {
    id: 'cmd-orphan',
    description: 'A peer-deleted target orphans the command without partial writes.',
    primary: { app: 'rounds', backend: 'sqlite' },
    phase: 3
  },
  {
    id: 'cmd-rebase',
    description: 'A pending command re-executes when a peer changes its base state.',
    primary: { app: 'chalk', backend: 'sqlite' },
    phase: 5
  },
  {
    id: 'cmd-undo-redo',
    description: 'Undo and redo work under concurrent peer edits.',
    primary: { app: 'chalk', backend: 'sqlite' },
    phase: 5
  },
  {
    id: 'dur-preview',
    description: 'A pending optimistic preview restores after reload before confirmed rows load.',
    primary: { app: 'rounds', backend: 'sqlite' },
    phase: 3
  },
  {
    id: 'dur-outbox',
    description: 'An offline mutation survives reload and delivers exactly once.',
    primary: { app: 'rounds', backend: 'sqlite' },
    phase: 3
  },
  {
    id: 'dur-generation',
    description: 'A disconnect after acknowledgement but before checkpoint does not lose the command.',
    primary: { app: 'rounds', backend: 'sqlite' },
    phase: 3
  },
  {
    id: 'dur-checkpoint',
    description: 'An unchanged mutation clears after its checkpoint.',
    primary: { app: 'rounds', backend: 'sqlite' },
    phase: 3
  },
  {
    id: 'dur-epoch',
    description: 'A server restart with a reset sequence does not strand the client.',
    primary: { app: 'rounds', backend: 'sqlite' },
    phase: 4
  },
  {
    id: 'contract-retire',
    description: 'A new row fingerprint retires old snapshots without loading stale rows.',
    primary: { app: 'rounds', backend: 'sqlite' },
    phase: 4
  },
  {
    id: 'contract-outbox',
    description: 'The outbox survives a fingerprint change and replays through validation.',
    primary: { app: 'rounds', backend: 'sqlite' },
    phase: 4
  },
  {
    id: 'contract-reload',
    description: 'An old open client reloads once for a new fingerprint without looping.',
    primary: { app: 'rounds', backend: 'sqlite' },
    phase: 4
  },
  {
    id: 'status-error',
    description: 'An initial query failure surfaces as error.',
    primary: { app: 'rounds', backend: 'sqlite' },
    phase: 3
  },
  {
    id: 'status-stale',
    description: 'A rerun failure keeps valid rows and surfaces as stale.',
    primary: { app: 'rounds', backend: 'sqlite' },
    phase: 3
  },
  {
    id: 'status-live',
    description: 'A later successful rerun returns the query to live.',
    primary: { app: 'rounds', backend: 'sqlite' },
    phase: 3
  },
  {
    id: 'auth-visibility',
    description: "A principal never receives another principal's private rows.",
    primary: { app: 'spoke', backend: 'sqlite' },
    phase: 6
  },
  {
    id: 'auth-grouping',
    description: 'Identical query names from different principals never share one result.',
    primary: { app: 'spoke', backend: 'sqlite' },
    phase: 6
  },
  {
    id: 'ws-isolation',
    description: 'Two workspaces never leak rows or presence.',
    primary: { app: 'spoke', backend: 'do' },
    phase: 7
  },
  {
    id: 'ws-hibernate',
    description: 'A deployed Durable Object hibernates and resumes its existing browser socket.',
    primary: { app: 'spoke', backend: 'deployed-do' },
    phase: 7,
    stretch: true
  },
  {
    id: 'node-delivery',
    description: 'Clients on two server nodes see the same mutation.',
    primary: { app: 'spoke', backend: 'two-node-postgres' },
    phase: 7
  },
  {
    id: 'node-recovery',
    description: 'A node that misses a notification recovers from the sync log.',
    primary: { app: 'spoke', backend: 'two-node-postgres' },
    phase: 7
  },
  {
    id: 'presence-live',
    description: 'Presence appears, updates, and clears on leave.',
    primary: { app: 'spoke', backend: 'sqlite' },
    phase: 6
  },
  {
    id: 'presence-ephemeral',
    description: 'Presence never survives reload as stored data.',
    primary: { app: 'chalk', backend: 'sqlite' },
    phase: 5
  }
] as const satisfies readonly BehaviorCatalogEntry[];
