/**
 * Canonical params serialization — THE one hasher for `(query, params)`
 * subscription identity. Two hashers would silently split one subscription
 * into two. Sorted keys, `undefined` stripped from
 * objects, everything non-JSON rejected loudly with a path. There is no
 * second implementation of this anywhere, ever.
 */

export class CanonicalParamsError extends Error {
  constructor(path: string, reason: string) {
    super(`Params are not canonicalizable at ${path || '(root)'}: ${reason}`);
  }
}

function canonicalize(value: unknown, path: string, seen: Set<object>): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return 'null';
  }
  switch (typeof value) {
    case 'string':
      return JSON.stringify(value);
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) {
        throw new CanonicalParamsError(path, `non-finite number ${value}`);
      }
      return JSON.stringify(value);
    case 'bigint':
      throw new CanonicalParamsError(path, 'bigint is not JSON');
    case 'function':
      throw new CanonicalParamsError(path, 'functions are not data');
    case 'symbol':
      throw new CanonicalParamsError(path, 'symbols are not data');
    case 'object':
      break;
    default:
      throw new CanonicalParamsError(path, `unsupported type ${typeof value}`);
  }
  const object = value as object;
  if (seen.has(object)) {
    throw new CanonicalParamsError(path, 'circular reference');
  }
  seen.add(object);
  try {
    if (Array.isArray(object)) {
      const items = object.map((item, index) => {
        const canonical = canonicalize(item, `${path}[${index}]`, seen);
        if (canonical === undefined) {
          throw new CanonicalParamsError(`${path}[${index}]`, 'undefined inside an array is ambiguous — use null');
        }
        return canonical;
      });
      return `[${items.join(',')}]`;
    }
    const proto = Object.getPrototypeOf(object);
    if (proto !== Object.prototype && proto !== null) {
      throw new CanonicalParamsError(path, `class instances are not data (${proto.constructor?.name ?? 'unknown'})`);
    }
    const entries: string[] = [];
    for (const key of Object.keys(object).sort()) {
      const canonical = canonicalize((object as Record<string, unknown>)[key], `${path}.${key}`, seen);
      if (canonical !== undefined) {
        entries.push(`${JSON.stringify(key)}:${canonical}`);
      }
    }
    return `{${entries.join(',')}}`;
  } finally {
    seen.delete(object);
  }
}

/**
 * Serialize params to their canonical string form. Two params objects are the
 * same subscription iff their canonical strings are equal.
 */
export function canonicalParams(params: unknown): string {
  const canonical = canonicalize(params, '', new Set());
  if (canonical === undefined) {
    throw new CanonicalParamsError('', 'params may not be undefined — use {}');
  }
  return canonical;
}
