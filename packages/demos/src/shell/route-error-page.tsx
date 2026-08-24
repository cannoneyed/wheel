/**
 * What the app shows in place of a route that threw.
 *
 * Two jobs. Say what happened in words a person can act on, and give a way out
 * that does not depend on the broken thing — Retry re-renders the same route,
 * and the home link leaves it behind entirely.
 *
 * `scope` tells the two cases apart: `'node'` means one page failed and the
 * chrome around it is intact; `'global'` means the whole routed tree went down,
 * so this fallback is all that is left on screen.
 */
// wheel-component-root: headless — stands in for a route node and adds no frame of its own
import type { RouteErrorProps } from 'wheel/router';
import { viewRoot } from 'wheel/core';
import { Button } from 'wheel/components';

import { appRouter } from './routes';

/** Best-effort message for anything a route may have thrown. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The demos app's route-error fallback. */
export function RouteErrorPage(props: RouteErrorProps) {
  return (
    <div
      use:viewRoot={{ name: 'RouteErrorPage', props }}
      class="route-error"
      role="alert"
      data-testid="route-error"
    >
      <h2>
        {props.scope === 'global' ? 'The app failed to render.' : 'This page failed to render.'}
      </h2>
      <p class="route-error-detail" data-testid="route-error-message">
        {messageOf(props.error)}
      </p>
      <p class="route-error-actions">
        <Button type="button" onClick={() => props.reset()} data-testid="route-error-retry">
          Retry
        </Button>
        <appRouter.Link to="home" data-testid="route-error-home">
          Back to demos
        </appRouter.Link>
      </p>
    </div>
  );
}
