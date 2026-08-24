/**
 * Pane identity for split view. A plain service: the root scope's
 * instance says "primary"; secondary panes override it with a fake so the
 * services constructed inside their scope know not to register global
 * surfaces (keyboard bindings, palette commands) twice.
 */
import { Service } from 'wheel/core';

/** Which pane a scope's services belong to. */
export class PaneService extends Service {
  /** True in the root/primary pane; secondary-pane scopes override to false. */
  readonly isPrimary = this.computed(() => true, 'isPrimary');
}
