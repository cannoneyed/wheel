// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { mergeProps } from './mergeProps';

describe('mergeProps', () => {
  it('chains camelCase event handlers right-to-left', () => {
    const order: string[] = [];
    const merged = mergeProps(
      { onClick: () => order.push('internal') },
      { onClick: () => order.push('external') },
    );
    (merged.onClick as (e: Event) => void)(new Event('click'));
    expect(order).toEqual(['external', 'internal']);
  });

  it('chains Solid namespaced capture handlers (oncapture:) like regular handlers', () => {
    const order: string[] = [];
    const merged = mergeProps(
      { 'oncapture:mousedown': () => order.push('internal') },
      { 'oncapture:mousedown': () => order.push('external') },
    );
    (merged['oncapture:mousedown'] as (e: Event) => void)(new Event('mousedown'));
    expect(order).toEqual(['external', 'internal']);
  });

  it('lets capture handlers cancel via preventBaseUIHandler', () => {
    const internal = vi.fn();
    const merged = mergeProps(
      { 'on:custom': internal },
      { 'on:custom': (event: any) => event.preventBaseUIHandler() },
    );
    (merged['on:custom'] as (e: Event) => void)(new Event('custom'));
    expect(internal).not.toHaveBeenCalled();
  });

  it('merges class right-to-left and styles with rightmost winning', () => {
    const merged = mergeProps(
      { class: 'a', style: { color: 'red', margin: '1px' } },
      { class: 'b', style: { color: 'blue' } },
    );
    expect(merged.class).toBe('b a');
    expect(merged.style).toEqual({ color: 'blue', margin: '1px' });
  });
});
