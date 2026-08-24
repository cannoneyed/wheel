/**
 * The app-facing logger — the `no-raw-console` lint rule funnels app code
 * here so nothing logged is ever invisible to the error-capture story:
 *
 *   logger.error('mutation rejected', rejection);   // captured + on console
 *
 * How capture attaches: the debug layer's error capture registers a SINK
 * (`setLoggerSink`). With a sink installed, calls flow to it — the sink
 * records the entry (id, stack, source-mapped frames) and forwards to the
 * real console itself. With no sink (production without capture, unit
 * tests), calls fall through to the console directly. Either way exactly one
 * console line is produced.
 *
 * Why not just call console and let dev-mode's console patch catch it: the
 * patch is DEV-ONLY (patching globals in production from a library is
 * invasive); the sink captures in production too, so an app that logs
 * through `logger` keeps its error buffer — and `window.__wheel.errors()`
 * keeps working — in any build that opts capture in.
 */

/** Log severities, console-aligned. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Where logger calls go when capture is installed; forwards to console itself. */
export type LoggerSink = (level: LogLevel, parts: readonly unknown[]) => void;

let sink: LoggerSink | null = null;

/**
 * Replace the logger's output sink. The debug layer's error capture installs
 * one automatically; apps may install their own to ship logs to a backend
 * (see the Production docs page). Last caller wins: replacing the capture's
 * sink disconnects the error buffer from logger.warn/error, so either
 * subscribe to the buffer or own the sink — not both.
 */
export function setLoggerSink(next: LoggerSink | null): void {
  sink = next;
}

function emit(level: LogLevel, parts: readonly unknown[]): void {
  if (sink) {
    sink(level, parts);
    return;
  }
  // wheel-console: the logger IS the sanctioned console door — with no
  // capture sink installed this passthrough is the only output path.
  console[level](...parts);
}

/** The one logging surface app code uses (see module doc). */
export const logger = {
  /** Verbose diagnostics; captured but never treated as a failure. */
  debug: (...parts: readonly unknown[]): void => emit('debug', parts),
  /** Notable events; captured but never treated as a failure. */
  info: (...parts: readonly unknown[]): void => emit('info', parts),
  /** Something looks wrong but the app continues; captured as a warning. */
  warn: (...parts: readonly unknown[]): void => emit('warn', parts),
  /** A real failure; captured as an error — agents and the harness see it. */
  error: (...parts: readonly unknown[]): void => emit('error', parts)
} as const;
