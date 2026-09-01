import { describe, expect, test } from 'vitest';

import type { BehaviorCatalogEntry } from '../test/behaviors/catalog';
import { type BehaviorReport, validateBehaviorResults } from './behavior-results';

const catalog = [
  {
    id: 'one',
    description: 'One.',
    primary: { app: 'axle', backend: 'sqlite' },
    phase: 8
  },
  {
    id: 'two',
    description: 'Two.',
    primary: { app: 'axle', backend: 'sqlite' },
    phase: 8
  }
] as const satisfies readonly BehaviorCatalogEntry[];

function report(
  file: string,
  entries: Array<{ title: string; status?: 'expected' | 'unexpected' | 'skipped' }>
): BehaviorReport {
  return {
    file,
    config: {
      metadata: { behaviorApp: 'axle', behaviorBackend: 'sqlite', behaviorVariant: 'default' }
    },
    suites: [
      {
        specs: entries.map(({ title, status = 'expected' }) => ({
          title,
          ok: status === 'expected',
          tests: [
            {
              expectedStatus: 'passed',
              status,
              results: status === 'skipped' ? [] : [{ status: status === 'expected' ? 'passed' : 'failed' }]
            }
          ]
        }))
      }
    ]
  };
}

describe('behavior results', () => {
  test('accepts one passing primary proof for every required behavior', () => {
    const summary = validateBehaviorResults(catalog, [
      report('axle.json', [{ title: 'proof @behavior:one @behavior:two' }])
    ]);

    expect(summary.errors).toEqual([]);
    expect(summary.passed).toBe(2);
  });

  test('rejects duplicate, failed, skipped, and missing primary proofs', () => {
    const fourRows = [
      ...catalog,
      {
        id: 'three',
        description: 'Three.',
        primary: { app: 'axle' as const, backend: 'sqlite' as const },
        phase: 8
      },
      {
        id: 'four',
        description: 'Four.',
        primary: { app: 'axle' as const, backend: 'sqlite' as const },
        phase: 8
      }
    ];
    const summary = validateBehaviorResults(fourRows, [
      report('first.json', [
        { title: 'first @behavior:one' },
        { title: 'failed @behavior:two', status: 'unexpected' },
        { title: 'skipped @behavior:three', status: 'skipped' }
      ]),
      report('second.json', [{ title: 'second @behavior:one' }])
    ]);

    expect(summary.errors).toEqual([
      'duplicate primary behavior one: first.json, second.json',
      'failed primary behavior two: first.json',
      'skipped primary behavior three: first.json',
      'missing primary behavior four'
    ]);
  });
});
