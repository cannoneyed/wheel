/**
 * Axle's Wheel config: app-wide settings for the global systems, read once
 * by `<WheelApp config>` in main.tsx.
 */
import { defineWheelConfig } from 'wheel/core';

export default defineWheelConfig({
  // Axle is our own app, so annotation is on in every build — including the
  // production preview the browser suite runs against. That is the
  // production story working, not a dev convenience.
  annotate: { enabled: true }
});
