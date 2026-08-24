/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import * as REASONS from './reason-parts';

export { REASONS };
export type BaseUIEventReasons = typeof REASONS;
export type BaseUIEventReason = BaseUIEventReasons[keyof BaseUIEventReasons];
