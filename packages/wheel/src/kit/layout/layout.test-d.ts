import { describe, expectTypeOf, it } from 'vitest';

import type { FrameSize, LayoutNode } from './model';
import type { SplitTree } from './split-tree';

describe('framing types', () => {
  it('accepts only px and fr size spellings', () => {
    expectTypeOf<'240px'>().toExtend<FrameSize>();
    expectTypeOf<'1.5fr'>().toExtend<FrameSize>();
    expectTypeOf<'auto'>().not.toExtend<FrameSize>();
    expectTypeOf<'50%'>().not.toExtend<FrameSize>();
    expectTypeOf<'calc(100% - 2px)'>().not.toExtend<FrameSize>();
  });

  it('keeps layout nodes and split trees JSON-plain', () => {
    expectTypeOf<LayoutNode['size']>().toExtend<FrameSize>();
    expectTypeOf<LayoutNode['pixels']>().toExtend<
      { inlineSize: number; blockSize: number } | null
    >();
    expectTypeOf<Extract<SplitTree, { kind: 'panel' }>['panelId']>().toBeString();
  });
});
