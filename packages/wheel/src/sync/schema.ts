/**
 * Schema layer: `t` IS Zod v4 — no bespoke validator to reinvent.
 *
 * One import point for the whole package; nothing outside this file imports
 * 'zod' directly, so swapping or subsetting later touches exactly one module.
 * Call style is Zod's: `t.string()`, not `t.string`.
 */
import { z } from 'zod';

export { z as t };

/** Extract the TypeScript type a schema validates to - Infer<typeof TodoRow>. */
export type Infer<T extends z.ZodType> = z.infer<T>;

/** A row schema must produce a plain JSON object. */
export type RowSchema<Row extends Record<string, unknown> = Record<string, unknown>> = z.ZodType<Row>;

/** One offending column in a row that failed boundary validation. */
export interface RowValidationIssue {
  path: string;
  message: string;
}

/** Thrown when a sync value is valid JavaScript but cannot round-trip through JSON. */
export class JsonValueError extends Error {
  constructor(
    public readonly source: string,
    public readonly path: string,
    public readonly reason: string
  ) {
    super(`${source} is not JSON data at ${path || '(root)'}: ${reason}`);
  }
}

function inspectJson(value: unknown, path: string, seen: Set<object>): { path: string; reason: string } | null {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? null : { path, reason: `non-finite number ${value}` };
  }
  if (value === undefined) return { path, reason: 'undefined is not JSON; use null or omit the field before validation' };
  if (typeof value === 'bigint') return { path, reason: 'bigint is not JSON' };
  if (typeof value === 'function') return { path, reason: 'functions are not data' };
  if (typeof value === 'symbol') return { path, reason: 'symbols are not data' };
  if (typeof value !== 'object') return { path, reason: `unsupported type ${typeof value}` };

  const object = value as object;
  if (seen.has(object)) return { path, reason: 'circular reference' };
  const proto = Object.getPrototypeOf(object);
  if (!Array.isArray(object) && proto !== Object.prototype && proto !== null) {
    return { path, reason: `class instances are not data (${proto.constructor?.name ?? 'unknown'})` };
  }
  seen.add(object);
  try {
    if (Array.isArray(object)) {
      for (let index = 0; index < object.length; index += 1) {
        const itemPath = `${path}[${index}]`;
        if (!(index in object)) return { path: itemPath, reason: 'sparse array entries are not JSON data' };
        const issue = inspectJson(object[index], itemPath, seen);
        if (issue) return issue;
      }
      return null;
    }
    for (const key of Object.keys(object)) {
      const issue = inspectJson(
        (object as Record<string, unknown>)[key],
        path === '' ? key : `${path}.${key}`,
        seen
      );
      if (issue) return issue;
    }
    return null;
  } finally {
    seen.delete(object);
  }
}

/** Assert that a value round-trips through JSON without coercion or data loss. */
export function validateJsonValue(source: string, value: unknown): void {
  const issue = inspectJson(value, '', new Set());
  if (issue) {
    throw new JsonValueError(source, issue.path, issue.reason);
  }
}

/** Thrown when a row fails schema validation at the server boundary - names the query and columns so SQL-schema drift is caught the moment it happens. */
export class RowValidationError extends Error {
  constructor(
    /** Which declaration the bad row belongs to, e.g. `query todos.byList` — named so agents can grep. */
    public readonly source: string,
    public readonly issues: RowValidationIssue[]
  ) {
    super(
      `Row failed schema validation for ${source}: ${issues
        .map((issue) => `${issue.path || '(root)'}: ${issue.message}`)
        .join('; ')}`
    );
  }
}

/**
 * Validate one row against a schema, throwing an error that names the source
 * declaration and the offending columns. Used at the server boundary before
 * any row is emitted, so no invalid row ever reaches a client.
 */
export function validateRow<Row extends Record<string, unknown>>(
  source: string,
  schema: RowSchema<Row>,
  row: unknown
): Row {
  const result = schema.safeParse(row);
  if (!result.success) {
    throw new RowValidationError(
      source,
      result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message
      }))
    );
  }
  try {
    validateJsonValue(source, result.data);
  } catch (error) {
    if (error instanceof JsonValueError) {
      throw new RowValidationError(source, [{ path: error.path, message: error.reason }]);
    }
    throw error;
  }
  return result.data;
}
