import { describe, expect, it } from 'vitest';

import {
  applyDockIntent,
  normalizeSplitTree,
  panelIds,
  removePanel,
  type SplitTree
} from './split-tree';

function panel(panelId: string): SplitTree {
  return { kind: 'panel', id: `leaf:${panelId}`, panelId };
}

function row(id: string, children: SplitTree[]): SplitTree {
  return { kind: 'split', id, axis: 'row', children };
}

function column(id: string, children: SplitTree[]): SplitTree {
  return { kind: 'split', id, axis: 'column', children };
}

describe('split tree reducers', () => {
  it('inserts a sibling for a same-axis edge drop', () => {
    const tree = row('root', [panel('a'), panel('b'), panel('c')]);
    const next = applyDockIntent(tree, {
      panelId: 'c',
      targetPanelId: 'a',
      edge: 'left'
    });
    expect(panelIds(next)).toEqual(['c', 'a', 'b']);
    expect(next.kind).toBe('split');
  });

  it('wraps the target in a new split for a cross-axis drop', () => {
    const tree = row('root', [panel('a'), panel('b')]);
    const next = applyDockIntent(tree, {
      panelId: 'b',
      targetPanelId: 'a',
      edge: 'bottom'
    });
    expect(next).toEqual(
      column('split-1', [panel('a'), panel('b')])
    );
  });

  it('detaches the dragged panel from its old location', () => {
    const tree = row('root', [
      panel('a'),
      column('side', [panel('b'), panel('c')])
    ]);
    const next = applyDockIntent(tree, {
      panelId: 'b',
      targetPanelId: 'a',
      edge: 'right'
    });
    expect(panelIds(next)).toEqual(['a', 'b', 'c']);
    // The single-child column collapsed away during normalization.
    expect(next).toEqual(row('root', [panel('a'), panel('b'), panel('c')]));
  });

  it('returns the same reference for self-drops and unknown ids', () => {
    const tree = row('root', [panel('a'), panel('b')]);
    expect(
      applyDockIntent(tree, { panelId: 'a', targetPanelId: 'a', edge: 'left' })
    ).toBe(tree);
    expect(
      applyDockIntent(tree, { panelId: 'zz', targetPanelId: 'a', edge: 'left' })
    ).toBe(tree);
    expect(
      applyDockIntent(tree, { panelId: 'a', targetPanelId: 'zz', edge: 'left' })
    ).toBe(tree);
  });

  it('preserves untouched branch references across a dock', () => {
    const untouched = column('side', [panel('x'), panel('y')]);
    const tree = row('root', [untouched, panel('a'), panel('b')]);
    const next = applyDockIntent(tree, {
      panelId: 'b',
      targetPanelId: 'a',
      edge: 'left'
    });
    expect(next.kind).toBe('split');
    if (next.kind === 'split') {
      expect(next.children[0]).toBe(untouched);
    }
  });

  it('allocates non-colliding deterministic split ids', () => {
    const tree = row('split-7', [panel('a'), panel('b'), panel('c')]);
    const next = applyDockIntent(tree, {
      panelId: 'c',
      targetPanelId: 'a',
      edge: 'top'
    });
    expect(next).toEqual(
      row('split-7', [
        column('split-8', [panel('c'), panel('a')]),
        panel('b')
      ])
    );
  });

  it('removePanel collapses the emptied structure', () => {
    const tree = row('root', [panel('a'), column('side', [panel('b')])]);
    expect(removePanel(tree, 'b')).toEqual(panel('a'));
    expect(removePanel(panel('only'), 'only')).toBeNull();
    const unknown = removePanel(tree, 'zz');
    expect(unknown).toBe(tree);
  });

  it('normalize merges same-axis nesting and keeps clean trees by reference', () => {
    const nested = row('outer', [
      panel('a'),
      row('inner', [panel('b'), panel('c')])
    ]);
    expect(normalizeSplitTree(nested)).toEqual(
      row('outer', [panel('a'), panel('b'), panel('c')])
    );
    const clean = row('root', [panel('a'), column('side', [panel('b'), panel('c')])]);
    expect(normalizeSplitTree(clean)).toBe(clean);
  });
});
