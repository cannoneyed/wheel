// @vitest-environment jsdom
/**
 * DOM probes for the debug panel: it must open from its toggle, mirror the
 * registry graph (service, primitives, component manifest), and live-update
 * displayed atom/computed values with no timers — all inside a clientless
 * ServiceProvider, where every client section stays hidden.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { JSX } from 'solid-js';
import { render } from 'solid-js/web';
import { setup } from 'xstate';

import { Service, ServiceProvider, connect } from '../core/index';
import { DebugPanelMachineDemo } from './debug-panel.states';
import { WheelDebugPanel } from './index';

const gaugeModeMachine = setup({
  types: {
    context: {} as Record<string, never>,
    events: {} as { readonly type: 'toggle' }
  }
}).createMachine({
  context: {},
  initial: 'idle',
  states: {
    idle: { on: { toggle: 'active' } },
    active: { on: { toggle: 'idle' } }
  }
});

class GaugeService extends Service {
  private readonly calibration = this.field(1, 'calibration');
  readonly level = this.atom(1, 'level');
  readonly doubled = this.computed(() => this.level.get() * 2, 'doubled');
  readonly raise = this.action((n: number) => this.level.set(this.level.get() + n), 'raise');
  readonly calibrate = this.action(() => this.calibration.set(this.calibration.get() + 1), 'calibrate');
  readonly mode = this.machine(gaugeModeMachine, {
    transitions: { toggle: () => ({ type: 'toggle' }) }
  });
}

const connectGaugeView = connect('GaugeView', (c) => {
  const gaugeService = c.service(GaugeService);
  return {
    get level() {
      return gaugeService.level.get();
    },
    get doubled() {
      return gaugeService.doubled();
    },
    get mode() {
      return gaugeService.mode.state().value;
    },
    raise: gaugeService.raise,
    calibrate: gaugeService.calibrate,
    toggle: gaugeService.mode.transitions.toggle
  };
});

function GaugeView() {
  const state = connectGaugeView({});
  return (
    <div>
      <button data-testid="raise" onClick={() => state.raise(2)}>
        {state.level}/{state.doubled}
      </button>
      <button data-testid="toggle-mode" onClick={state.toggle}>
        {String(state.mode)}
      </button>
      <button data-testid="calibrate" onClick={state.calibrate}>calibrate</button>
    </div>
  );
}

function mount(element: () => JSX.Element) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const dispose = render(element, host);
  return {
    host,
    cleanup: () => {
      dispose();
      host.remove();
    }
  };
}

beforeEach(() => {
  localStorage.removeItem('wheel.debug-panel.open');
});

describe('WheelDebugPanel in a clientless ServiceProvider', () => {
  it('opens from the toggle and shows the service graph with live values', () => {
    const { host, cleanup } = mount(() => (
      <ServiceProvider scopeId="dbg">
        <GaugeView />
        <WheelDebugPanel />
      </ServiceProvider>
    ));
    try {
      expect(host.querySelector('[data-testid=wheel-debug]')).not.toBeNull();
      expect(host.querySelector('[data-testid=wheel-debug-panel]')).toBeNull();

      (host.querySelector('[data-testid=wheel-debug-toggle]') as HTMLButtonElement).click();
      const panel = host.querySelector('[data-testid=wheel-debug-panel]');
      expect(panel).not.toBeNull();
      expect(localStorage.getItem('wheel.debug-panel.open')).toBe('open');

      // Registry graph: the service, its primitives, and the component manifest.
      expect(panel!.textContent).toContain('GaugeService');
      expect(host.querySelector('[data-primitive=level]')!.textContent).toContain('1');
      expect(host.querySelector('[data-primitive=doubled]')!.textContent).toContain('2');
      const field = host.querySelector('[data-primitive=calibration]');
      expect(field?.textContent).toContain('calibration · field');
      expect(field?.textContent).toContain('current:1');
      expect(field?.textContent).toContain('history[0]');
      const machine = host.querySelector('[data-primitive=mode]');
      expect(machine?.textContent).toContain('mode · machine');
      expect(machine?.textContent).toContain('current:');
      expect(machine?.textContent).toContain('"idle"');
      expect(machine?.textContent).toContain('history');
      // Actions render as a default-closed dictionary, not per-action rows.
      expect(host.querySelector('[data-primitive=raise]')).toBeNull();
      expect(panel!.textContent).toContain('actions');
      const actions = [...panel!.querySelectorAll('div')].find(
        (element) => element.textContent === '▸actions(3)' && element.children.length === 3
      );
      (actions as HTMLDivElement).click();
      expect(panel!.textContent).toContain('mode.toggle');
      expect(panel!.textContent).toContain('GaugeView');
      expect(panel!.textContent).toContain('service:GaugeService');

      // Clientless provider: client sections are hidden, not broken.
      expect(host.querySelector('[data-testid=wheel-debug-stream]')).toBeNull();

      // An action fires → the displayed values update (no timers involved).
      (host.querySelector('[data-testid=raise]') as HTMLButtonElement).click();
      expect(host.querySelector('[data-primitive=level]')!.textContent).toContain('3');
      expect(host.querySelector('[data-primitive=doubled]')!.textContent).toContain('6');
      // This action writes only a field. The panel updates through the debug
      // revision without an atom, client revision, or component render.
      (host.querySelector('[data-testid=calibrate]') as HTMLButtonElement).click();
      const updatedField = host.querySelector('[data-primitive=calibration]');
      expect(updatedField?.textContent).toContain('current:2');
      expect(updatedField?.textContent).toContain('history[1]');
      (host.querySelector('[data-testid=toggle-mode]') as HTMLButtonElement).click();
      expect(machine?.textContent).toContain('"active"');
    } finally {
      cleanup();
    }
  });

  it('restores the persisted open state from localStorage', () => {
    localStorage.setItem('wheel.debug-panel.open', 'open');
    const { host, cleanup } = mount(() => (
      <ServiceProvider scopeId="dbg2">
        <WheelDebugPanel />
      </ServiceProvider>
    ));
    try {
      expect(host.querySelector('[data-testid=wheel-debug-panel]')).not.toBeNull();
    } finally {
      cleanup();
    }
  });

  it('renders the overlapping-seek proof and ignores the stale completion', () => {
    const { host, cleanup } = mount(() => <DebugPanelMachineDemo />);
    try {
      expect(host.querySelector('[data-testid=machine-proof]')).not.toBeNull();
      expect(host.textContent).toContain('A boolean cannot tell which seek finished.');
      expect(host.querySelector('[data-testid=wheel-debug-panel]')).not.toBeNull();

      (host.querySelector('[data-testid=request-one]') as HTMLButtonElement).click();
      expect(host.querySelector('[data-testid=seek-state]')?.textContent).toBe('seeking');
      (host.querySelector('[data-testid=request-two]') as HTMLButtonElement).click();
      (host.querySelector('[data-testid=resolve-one]') as HTMLButtonElement).click();
      expect(host.querySelector('[data-testid=ignored-count]')?.textContent).toBe('1');
      expect(host.querySelector('[data-testid=seek-result]')?.textContent).toContain(
        'Ignored stale completion for request #1.'
      );

      (host.querySelector('[data-testid=resolve-two]') as HTMLButtonElement).click();
      expect(host.querySelector('[data-testid=seek-state]')?.textContent).toBe('settled');
      expect(host.querySelector('[data-testid=seek-position]')?.textContent).toBe('90s');
      expect(host.querySelector('[data-primitive=seek]')?.textContent).toContain('settled');
    } finally {
      cleanup();
    }
  });
});
