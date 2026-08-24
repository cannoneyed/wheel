import type { StateAttributesMapping } from '../../internals/getStateAttributesProps';
import type { ScrollAreaRootState } from './ScrollAreaRoot';
import { ScrollAreaRootDataAttributes } from './ScrollAreaRootDataAttributes';

/**
 * Solid port of upstream's `scroll-area/root/stateAttributes.ts`. Shared across `Root`,
 * `Viewport`, `Content`, and `Scrollbar` (whose state is a superset), matching upstream.
 */
export const scrollAreaStateAttributesMapping: StateAttributesMapping<ScrollAreaRootState> = {
  hasOverflowX: (value) => (value ? { [ScrollAreaRootDataAttributes.hasOverflowX]: '' } : null),
  hasOverflowY: (value) => (value ? { [ScrollAreaRootDataAttributes.hasOverflowY]: '' } : null),
  overflowXStart: (value) => (value ? { [ScrollAreaRootDataAttributes.overflowXStart]: '' } : null),
  overflowXEnd: (value) => (value ? { [ScrollAreaRootDataAttributes.overflowXEnd]: '' } : null),
  overflowYStart: (value) => (value ? { [ScrollAreaRootDataAttributes.overflowYStart]: '' } : null),
  overflowYEnd: (value) => (value ? { [ScrollAreaRootDataAttributes.overflowYEnd]: '' } : null),
  cornerHidden: () => null,
};
