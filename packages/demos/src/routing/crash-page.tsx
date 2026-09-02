/**
 * A page that throws on purpose, so the router's error containment is something
 * you can click rather than something you read about.
 *
 * The failure is the realistic one — a service blowing up while it constructs,
 * not a hand-thrown error in a component body. `CrashService`'s computed runs
 * immediately, inside `c.service(...)`, inside this page's connect.
 *
 * What should happen when you visit it: this pane shows the error fallback, and
 * everything around it — the sidebar, the routing-demo nav, the history buttons
 * — keeps working. Click any other link and the app is fine again.
 */
// wheel-component-root: headless — the error boundary above replaces this whole node
import { Service } from 'wheel/core';
import { connect, view } from 'wheel/core';

/** Explodes on construction, the way a real broken dependency does. */
class CrashService extends Service {
  /** Identity that survives minification (see require-service-name). */
  static override serviceName = 'CrashService';

  readonly value = this.computed((): string => {
    throw new Error('CrashService failed to initialize (this is deliberate)');
  }, 'value');
}

const connectCrashPage = connect('CrashPage', (c) => {
  const crash = c.service(CrashService);
  return view({ value: crash.value });
});

/** Never renders — the connect above throws first. */
export function CrashPage() {
  const state = connectCrashPage({});
  return <div data-testid="crash-page">{state.value}</div>;
}
