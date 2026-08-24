// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createSignal, type Accessor } from 'solid-js';
import { render } from '@solidjs/testing-library';
import { useFloating } from '../hooks/useFloating';
import { FloatingDelayGroup, useDelayGroup, type UseDelayGroupReturn } from './FloatingDelayGroup';

interface ConsumerProps {
  open: Accessor<boolean>;
  onOpenChange?: (open: boolean, details: unknown) => void;
  onResult: (result: UseDelayGroupReturn) => void;
}

function Consumer(props: ConsumerProps) {
  // `props.open`/`props.onOpenChange` are handed off as-is (accessor/callback
  // references, not read here) to `useFloating`/`useDelayGroup`, which read
  // them reactively themselves — the lint rule can't trace that through.
  const floating = useFloating({
    open: props.open,
    onOpenChange: props.onOpenChange,
  });
  const group = useDelayGroup(floating.context, { open: props.open });
  // Runs once at setup to hand the result out to the test.
  props.onResult(group);
  return null;
}

describe('useDelayGroup', () => {
  it('reports hasProvider: false and a fixed delayRef without an ancestor FloatingDelayGroup', () => {
    let result: UseDelayGroupReturn | undefined;
    const [open] = createSignal(false);

    render(() => <Consumer open={open} onResult={(r) => (result = r)} />);

    expect(result!.hasProvider).toBe(false);
    expect(result!.delayRef.current).toBe(0);
    expect(result!.isInstantPhase()).toBe(false);
  });

  it('exposes hasProvider: true and the group delay inside a FloatingDelayGroup', () => {
    let result: UseDelayGroupReturn | undefined;
    const [open] = createSignal(false);

    render(() => (
      <FloatingDelayGroup delay={{ open: 1000, close: 200 }}>
        <Consumer open={open} onResult={(r) => (result = r)} />
      </FloatingDelayGroup>
    ));

    expect(result!.hasProvider).toBe(true);
    expect(result!.delayRef.current).toEqual({ open: 1000, close: 200 });
  });

  it('zeroes the open delay for the active member while it is open', () => {
    let result: UseDelayGroupReturn | undefined;
    const [open, setOpen] = createSignal(false);

    render(() => (
      <FloatingDelayGroup delay={{ open: 1000, close: 200 }}>
        <Consumer open={open} onResult={(r) => (result = r)} />
      </FloatingDelayGroup>
    ));

    setOpen(true);

    expect(result!.delayRef.current).toEqual({ open: 0, close: 200 });
  });

  it('marks the instant phase and closes the previous member when switching within the group', () => {
    let resultA: UseDelayGroupReturn | undefined;
    let resultB: UseDelayGroupReturn | undefined;
    const [openA, setOpenA] = createSignal(false);
    const [openB, setOpenB] = createSignal(false);
    const onOpenChangeA = vi.fn((next: boolean) => setOpenA(next));
    const onOpenChangeB = vi.fn((next: boolean) => setOpenB(next));

    render(() => (
      <FloatingDelayGroup delay={{ open: 1000, close: 200 }}>
        <Consumer open={openA} onOpenChange={onOpenChangeA} onResult={(r) => (resultA = r)} />
        <Consumer open={openB} onOpenChange={onOpenChangeB} onResult={(r) => (resultB = r)} />
      </FloatingDelayGroup>
    ));

    setOpenA(true);
    expect(resultA!.isInstantPhase()).toBe(false);

    setOpenB(true);

    expect(onOpenChangeA).toHaveBeenCalledWith(false, expect.anything());
    expect(resultB!.isInstantPhase()).toBe(true);
  });
});
