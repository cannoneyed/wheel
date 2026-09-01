import { describe, expect, test } from 'vitest';

import { BEHAVIOR_CATALOG } from '../test/behaviors/catalog';
import { validateBehaviorCoverage } from './behavior-coverage';

describe('behavior coverage', () => {
  test('keeps 31 required rows and one stretch row', () => {
    expect(BEHAVIOR_CATALOG).toHaveLength(32);
    expect(BEHAVIOR_CATALOG.filter((entry) => !entry.stretch)).toHaveLength(31);
    expect(BEHAVIOR_CATALOG.filter((entry) => entry.stretch)).toHaveLength(1);
  });

  test('reports unknown, missing, duplicate, and unassigned primary proofs', () => {
    const catalog = [
      {
        id: 'known',
        description: 'Known behavior.',
        primary: { app: 'axle' as const, backend: 'sqlite' as const },
        phase: 2
      },
      {
        id: 'missing',
        description: 'Missing behavior.',
        primary: { app: 'rounds' as const, backend: 'sqlite' as const },
        phase: 2
      }
    ];
    const errors = validateBehaviorCoverage({
      catalog,
      coveragePhase: 2,
      sources: [
        {
          file: 'packages/tracker/browser/proof.spec.ts',
          text: "test('one @behavior:known', run); test('two @behavior:known @behavior:unknown', run);"
        }
      ],
      pipeline: 'key: "check-browser-apps-sqlite"'
    });

    expect(errors).toEqual([
      'unknown behavior tag unknown in packages/tracker/browser/proof.spec.ts',
      'duplicate primary behavior tag known: packages/tracker/browser/proof.spec.ts, packages/tracker/browser/proof.spec.ts',
      'missing primary behavior tag missing in packages/rounds/browser/',
      'primary behavior missing has no CI leg for rounds/sqlite'
    ]);
  });
});
