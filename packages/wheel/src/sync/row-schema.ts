/** Prefix and digest format shared by generated contracts, caches, and transports. */
export const ROW_SCHEMA_FINGERPRINT_PREFIX = 'wheel-rows-sha256:' as const;

const ROW_SCHEMA_FINGERPRINT_PATTERN = /^wheel-rows-sha256:[0-9a-f]{64}$/;

/** Exact identity of the declarations that control cached subscription rows. */
export type RowSchemaFingerprint = `${typeof ROW_SCHEMA_FINGERPRINT_PREFIX}${string}`;

/** Allow one asset reload for each new server row contract. */
export function createRowSchemaReloadGuard(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
  key: string
): {
  readonly shouldReload: (serverFingerprint: string) => boolean;
  readonly clear: () => void;
} {
  if (key === '') throw new TypeError('The row-schema reload key must be non-empty.');
  return Object.freeze({
    shouldReload(serverFingerprint) {
      const fingerprint = validateRowSchemaFingerprint(serverFingerprint);
      if (storage.getItem(key) === fingerprint) return false;
      storage.setItem(key, fingerprint);
      return true;
    },
    clear() {
      storage.removeItem(key);
    }
  });
}

/** Validate a generated row fingerprint at a public configuration boundary. */
export function validateRowSchemaFingerprint(
  value: unknown,
  name = 'rowSchemaFingerprint'
): RowSchemaFingerprint {
  if (typeof value !== 'string' || !ROW_SCHEMA_FINGERPRINT_PATTERN.test(value)) {
    throw new TypeError(
      `${name} must be ${ROW_SCHEMA_FINGERPRINT_PREFIX} followed by 64 lowercase hexadecimal characters.`
    );
  }
  return value as RowSchemaFingerprint;
}
