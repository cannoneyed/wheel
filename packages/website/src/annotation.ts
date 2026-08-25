/**
 * Who gets the annotator on wheel.dev.
 *
 * Every branch push deploys the whole site to its own Worker
 * (`wheel-site-<branch>.workers.dev`), and those previews are exactly where
 * you want to leave notes: you are looking at a change and want to say what is
 * wrong with it. Production is a different audience — a visitor reading the
 * docs should not find a ✎ chip, and should certainly not have a recorder
 * running.
 *
 * So the rule is the host. Previews and local dev annotate; wheel.dev does
 * not. This is the app making the call, which is the contract `WheelAnnotate`
 * asks for: it decides whose application state may be captured, and the
 * framework never guesses.
 */

/** The one host that does not get annotation. */
const PRODUCTION_HOST = 'wheel.dev';

/** Whether this page should offer annotation (branch previews and local dev). */
export function annotationEnabled(): boolean {
  // wheel-raw-location: the decision is about which HOST is serving this page,
  // not about a route. Nothing here navigates, and the site deliberately does
  // not depend on wheel/router.
  const host = globalThis.location?.hostname ?? '';
  return host !== PRODUCTION_HOST && host !== `www.${PRODUCTION_HOST}`;
}
