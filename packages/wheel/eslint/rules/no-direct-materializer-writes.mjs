/**
 * WHY THIS RULE EXISTS (the client ownership boundary):
 *
 * WheelMaterializer owns confirmed rows, optimistic replay, query membership,
 * and the one-publication boundary. A second caller can write between
 * SyncClient's transport and command lifecycle steps, leaving the visible rows
 * ahead of the outbox or checkpoint state:
 *
 *   import { WheelMaterializer } from '../../wheel/src/sync/client/materializer'; // ❌
 *   materializer.applyServerBatch(batch);
 *
 * SyncClient is the only production owner. Consumers use its public methods:
 *
 *   await client.mutate(issueUpdate, args); // ✅
 *
 * Tests may import the materializer directly to prove the boundary itself.
 */

import path from 'node:path';

const TEST_FILE = /\.(?:test|spec|bun-test)\.[cm]?[jt]sx?$/;
const MATERIALIZER_MODULE = /(?:^|\/)sync\/client\/materializer(?:\.[cm]?[jt]s)?$/;
const MATERIALIZER_FILE = /(?:^|\/)packages\/wheel\/src\/sync\/client\/materializer(?:\.[cm]?[jt]s)?$/;

function normalize(value) {
  return value.replaceAll('\\', '/');
}

function isAllowed(filename) {
  const normalized = normalize(filename);
  return (
    TEST_FILE.test(normalized) ||
    normalized.endsWith('/packages/wheel/src/sync/client/client.ts') ||
    normalized === 'packages/wheel/src/sync/client/client.ts'
  );
}

function isMaterializerImport(source, filename) {
  if (typeof source !== 'string') return false;
  const normalizedSource = normalize(source);
  if (MATERIALIZER_MODULE.test(normalizedSource)) return true;
  if (!normalizedSource.startsWith('.')) return false;
  const resolved = path.posix.resolve(
    path.posix.dirname(normalize(filename)),
    normalizedSource
  );
  return MATERIALIZER_FILE.test(resolved);
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'keep WheelMaterializer writes inside SyncClient'
    },
    messages: {
      directAccess:
        'WheelMaterializer is internal to SyncClient. Use SyncClient so row publication stays atomic with command and checkpoint state.'
    },
    schema: []
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (isAllowed(filename)) return {};

    const check = (node) => {
      if (isMaterializerImport(node.source?.value, filename)) {
        context.report({ node, messageId: 'directAccess' });
      }
    };

    return {
      ImportDeclaration: check,
      ExportAllDeclaration: check,
      ExportNamedDeclaration: check,
      ImportExpression(node) {
        if (
          node.source?.type === 'Literal' &&
          isMaterializerImport(node.source.value, filename)
        ) {
          context.report({ node, messageId: 'directAccess' });
        }
      }
    };
  }
};
