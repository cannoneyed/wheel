import type { ReporterDescription } from '@playwright/test';
import { resolve } from 'node:path';

import type { BehaviorApp, BehaviorBackend } from '../test/behaviors/catalog';

/** Add app and backend identity to the Playwright JSON consumed by the coverage gate. */
export function behaviorReport(
  root: string,
  app: BehaviorApp,
  backend: BehaviorBackend,
  variant?: string
) {
  const name = [app, backend, variant].filter(Boolean).join('-');
  const reporter: ReporterDescription[] = [
    ['github'],
    ['json', { outputFile: resolve(root, `.artifacts/behavior-results/${name}.json`) }]
  ];

  return {
    metadata: { behaviorApp: app, behaviorBackend: backend, behaviorVariant: variant ?? 'default' },
    reporter: process.env.CI ? reporter : 'line'
  };
}
