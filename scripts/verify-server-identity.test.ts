/**
 * The path comparison behind "is this server my checkout?".
 *
 * It is two lines and one of them is a prefix test, which is precisely the
 * kind of thing that quietly accepts a neighbouring directory.
 */
import { describe, expect, it } from 'vitest';

import { servesThisCheckout } from './verify-server-identity';

describe('servesThisCheckout', () => {
  it('accepts the checkout itself', () => {
    expect(servesThisCheckout('/src/wheel', '/src/wheel')).toBe(true);
  });

  it('accepts a package inside it, which is where an app usually roots', () => {
    expect(servesThisCheckout('/src/wheel/packages/website', '/src/wheel')).toBe(true);
  });

  it('ignores a trailing slash on either side', () => {
    expect(servesThisCheckout('/src/wheel/', '/src/wheel')).toBe(true);
    expect(servesThisCheckout('/src/wheel', '/src/wheel/')).toBe(true);
  });

  it('rejects a sibling whose name merely starts the same', () => {
    // The bug this test exists for: `/src/wheel-other` starts with
    // `/src/wheel`, and a prefix test without the slash would take it.
    expect(servesThisCheckout('/src/wheel-other', '/src/wheel')).toBe(false);
  });

  it('rejects another worktree of the same repository', () => {
    expect(
      servesThisCheckout('/src/wheel/.claude/worktrees/other', '/src/wheel/.claude/worktrees/mine')
    ).toBe(false);
  });
});
