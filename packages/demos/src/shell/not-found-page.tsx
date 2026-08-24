/**
 * What renders when the URL matches nothing in the table.
 *
 * The router hands control here rather than throwing, because a URL is user
 * input: a typo in the address bar should look like a missing page, not a
 * crashed app.
 */
import { viewRoot } from 'wheel/core';

import { appRouter } from './routes';

/** The demo app's 404. */
export function NotFoundPage() {
  return (
    <div use:viewRoot={'NotFoundPage'} class="not-found" data-testid="not-found">
      <h2>No route for this URL</h2>
      <appRouter.Link to="home" data-testid="not-found-home">
        Back to the start
      </appRouter.Link>
    </div>
  );
}
