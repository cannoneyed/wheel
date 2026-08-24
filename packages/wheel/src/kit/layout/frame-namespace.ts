import { FrameDock } from './dock';
import { FrameColumn, FrameDrawer, FrameRow } from './frame';

/**
 * The framing component namespace: `Frame.Row`, `Frame.Column`,
 * `Frame.Drawer`, and the opt-in `Frame.Dock`.
 */
export const Frame = {
  Row: FrameRow,
  Column: FrameColumn,
  Drawer: FrameDrawer,
  Dock: FrameDock
} as const;
