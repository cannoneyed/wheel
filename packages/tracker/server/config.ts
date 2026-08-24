import { z } from 'zod';

const positiveInteger = (fallback: number) =>
  z.coerce.number().int().positive().default(fallback);

const optionalNonEmpty = z
  .string()
  .trim()
  .min(1)
  .optional();

const EnvironmentSchema = z
  .object({
    TRACKER_MODE: z.enum(['demo', 'production']).default('demo'),
    TRACKER_PORT: positiveInteger(4797),
    TRACKER_WORKSPACE_ID: optionalNonEmpty,
    TRACKER_DATABASE_FILENAME: optionalNonEmpty,
    TRACKER_AUTH_SESSION_URL: z.url().optional(),
    TRACKER_MAX_BODY_BYTES: positiveInteger(256 * 1024),
    TRACKER_REQUESTS_PER_MINUTE: positiveInteger(1_200)
  })
  .superRefine((value, context) => {
    if (value.TRACKER_MODE !== 'production') return;
    if (!value.TRACKER_WORKSPACE_ID) {
      context.addIssue({
        code: 'custom',
        path: ['TRACKER_WORKSPACE_ID'],
        message: 'is required in production mode'
      });
    }
    if (!value.TRACKER_DATABASE_FILENAME || value.TRACKER_DATABASE_FILENAME === ':memory:') {
      context.addIssue({
        code: 'custom',
        path: ['TRACKER_DATABASE_FILENAME'],
        message: 'must name a persistent SQLite file in production mode'
      });
    }
    if (!value.TRACKER_AUTH_SESSION_URL) {
      context.addIssue({
        code: 'custom',
        path: ['TRACKER_AUTH_SESSION_URL'],
        message: 'is required in production mode'
      });
    }
  });

/** Fully validated operating settings for the Tracker server. */
export interface TrackerServerConfig {
  readonly mode: 'demo' | 'production';
  readonly port: number;
  readonly workspaceId: string;
  readonly databaseFilename: string;
  readonly authSessionUrl?: string;
  readonly maxBodyBytes: number;
  readonly requestsPerMinute: number;
}

/**
 * Read the server environment once. Production refuses unsafe demo defaults
 * instead of silently booting an in-memory, header-trusting process.
 */
export function loadTrackerServerConfig(
  environment: Record<string, string | undefined>,
  legacyPort?: string
): TrackerServerConfig {
  const parsed = EnvironmentSchema.parse({
    ...environment,
    // PORT is how portless (and any other supervisor) assigns a free port.
    TRACKER_PORT: environment.TRACKER_PORT ?? legacyPort ?? environment.PORT
  });
  return Object.freeze({
    mode: parsed.TRACKER_MODE,
    port: parsed.TRACKER_PORT,
    workspaceId: parsed.TRACKER_WORKSPACE_ID ?? 'axle-demo',
    databaseFilename: parsed.TRACKER_DATABASE_FILENAME ?? ':memory:',
    authSessionUrl: parsed.TRACKER_AUTH_SESSION_URL,
    maxBodyBytes: parsed.TRACKER_MAX_BODY_BYTES,
    requestsPerMinute: parsed.TRACKER_REQUESTS_PER_MINUTE
  });
}
