/**
 * The site's Wheel config, read once by each page's `<WheelApp>`.
 *
 * Annotation follows the host (see `annotation.ts`): branch previews and
 * local dev offer it, wheel.dev does not. The host is known at bootstrap,
 * which is exactly when config is read.
 */
import { defineWheelConfig } from 'wheel/core';

import { annotationEnabled } from './annotation';

export default defineWheelConfig({
  annotate: { enabled: annotationEnabled() }
});
