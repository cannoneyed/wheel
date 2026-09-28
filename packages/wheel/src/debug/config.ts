/**
 * The `debug` section of the Wheel app config (see `defineWheelConfig`).
 *
 *   export default defineWheelConfig({ debug: { control: 'controlled' } });
 */
import { z } from 'zod';

/** The `debug` section: dev-only debug chrome. */
export const debugConfigSchema = z.strictObject({
  /**
   * `'built-in'` (default): WheelApp draws its own launcher chip.
   * `'controlled'`: no chip; the app opens the panel with
   * `DebugPanelService.toggle` from its own control.
   */
  control: z.enum(['built-in', 'controlled']).default('built-in')
});

declare module '../core/index' {
  interface WheelAppConfig {
    /** Dev-only debug chrome. */
    readonly debug?: z.input<typeof debugConfigSchema>;
  }
}
