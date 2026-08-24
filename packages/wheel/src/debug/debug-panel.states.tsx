/** Live proof for a Service-owned XState machine in the real debug panel. */
import { assign, setup } from 'xstate';
import { onMount } from 'solid-js';

import {
  Service,
  ServiceProvider,
  componentRoot,
  connect,
  defineStates,
  viewRoot
} from '../core';

import { WheelDebugPanel } from './debug-panel';

interface SeekContext {
  readonly activeRequest: number | null;
  readonly target: number | null;
  readonly position: number;
  readonly ignored: number;
  readonly result: string;
}

type SeekEvent =
  | { readonly type: 'request'; readonly requestId: number; readonly target: number }
  | { readonly type: 'resolve'; readonly requestId: number; readonly position: number }
  | { readonly type: 'cancel' };

const seekMachine = setup({
  types: {
    context: {} as SeekContext,
    events: {} as SeekEvent
  },
  guards: {
    isCurrent: ({ context, event }) =>
      event.type === 'resolve' && event.requestId === context.activeRequest
  },
  actions: {
    begin: assign(({ event }) =>
      event.type === 'request'
        ? {
            activeRequest: event.requestId,
            target: event.target,
            result: `Request #${event.requestId} is seeking to ${event.target}s.`
          }
        : {}
    ),
    complete: assign(({ event }) =>
      event.type === 'resolve'
        ? {
            activeRequest: null,
            target: null,
            position: event.position,
            result: `Request #${event.requestId} set playback to ${event.position}s.`
          }
        : {}
    ),
    ignoreStale: assign(({ context, event }) =>
      event.type === 'resolve'
        ? {
            ignored: context.ignored + 1,
            result: `Ignored stale completion for request #${event.requestId}.`
          }
        : {}
    ),
    cancel: assign({
      activeRequest: null,
      target: null,
      result: 'The active seek was canceled.'
    })
  }
}).createMachine({
  id: 'seek-demo',
  context: {
    activeRequest: null,
    target: null,
    position: 0,
    ignored: 0,
    result: 'No seek has started.'
  },
  initial: 'idle',
  states: {
    idle: {
      on: {
        request: { target: 'seeking', actions: 'begin' },
        resolve: { actions: 'ignoreStale' }
      }
    },
    seeking: {
      on: {
        request: { actions: 'begin' },
        resolve: [
          { guard: 'isCurrent', target: 'settled', actions: 'complete' },
          { actions: 'ignoreStale' }
        ],
        cancel: { target: 'idle', actions: 'cancel' }
      }
    },
    settled: {
      on: {
        request: { target: 'seeking', actions: 'begin' },
        resolve: { actions: 'ignoreStale' }
      }
    }
  }
});

class MachineProofService extends Service {
  readonly seek = this.machine(seekMachine, {
    transitions: {
      request: (requestId: number, target: number) => ({ type: 'request', requestId, target }),
      resolve: (requestId: number, position: number) => ({ type: 'resolve', requestId, position }),
      cancel: () => ({ type: 'cancel' })
    }
  });
}

class FieldProofService extends Service {
  private readonly retryCount = this.field(0);

  readonly recordRetry = this.action(() => {
    this.retryCount.set(this.retryCount.get() + 1);
  }, 'recordRetry');
}

const connectMachineProofControls = connect('MachineProofControls', (context) => {
  const service = context.service(MachineProofService);
  const fieldService = context.service(FieldProofService);
  return {
    get state() {
      return service.seek.state().value;
    },
    get context() {
      return service.seek.state().context;
    },
    request: service.seek.transitions.request,
    resolve: service.seek.transitions.resolve,
    cancel: service.seek.transitions.cancel,
    recordRetry: fieldService.recordRetry
  };
});

const cardStyle = {
  background: '#ffffff',
  border: '1px solid #d9dce3',
  'border-radius': '12px',
  padding: '18px'
};

let fieldControlRenders = 0;

/** One field-only write. The debug panel changes, but this component does not. */
function FieldProofControls(props: { recordRetry: () => void }) {
  const renderNumber = ++fieldControlRenders;
  return (
    <section
      use:viewRoot={{ name: 'FieldProofControls', props }}
      style={{ ...cardStyle, margin: '0 0 14px' }}
      aria-label="Tracked field proof"
    >
      <p style={{ margin: '0 0 6px', color: '#5b6475', 'font-size': '13px', 'font-weight': 700 }}>
        TRACKED, NOT REACTIVE
      </p>
      <h2 style={{ margin: '0 0 8px', 'font-size': '20px' }}>Private retry count</h2>
      <p style={{ margin: '0 0 14px', color: '#4c566a', 'font-size': '14px', 'line-height': 1.5 }}>
        Click the button. The open debug panel adds a retryCount write. This component stays on render{' '}
        <strong data-testid="field-render-count">{renderNumber}</strong>.
      </p>
      <button
        type="button"
        data-testid="record-field-write"
        onClick={props.recordRetry}
        style={{
          padding: '10px 12px',
          border: '1px solid #cbd1dc',
          'border-radius': '8px',
          background: '#fff',
          color: '#172033',
          cursor: 'pointer'
        }}
      >
        Record field-only write
      </button>
    </section>
  );
}

/** Guided controls that reproduce the race a boolean cannot represent. */
function MachineProofControls() {
  const state = connectMachineProofControls({});
  return (
    <main
      use:componentRoot
      data-testid="machine-proof"
      style={{
        'box-sizing': 'border-box',
        'min-height': '100vh',
        padding: '28px',
        background: '#f3f5f8',
        color: '#172033',
        'font-family': 'Inter, ui-sans-serif, system-ui, sans-serif'
      }}
    >
      <div style={{ 'max-width': '650px' }}>
        <p style={{ margin: '0 0 6px', color: '#5b6475', 'font-size': '13px', 'font-weight': 700 }}>
          SERVICE DEBUG PROOF
        </p>
        <h1 style={{ margin: '0 0 10px', 'font-size': '28px' }}>Tracked service primitives</h1>
        <p style={{ margin: '0 0 20px', color: '#4c566a', 'line-height': 1.5 }}>
          Fields keep a write log without a signal. A boolean cannot tell which seek finished. The
          machine keeps explicit transitions and state.
        </p>

        <FieldProofControls recordRetry={state.recordRetry} />

        <section style={{ ...cardStyle, margin: '0 0 14px' }} aria-label="Current machine state">
          <div style={{ display: 'flex', gap: '10px', 'align-items': 'center', 'margin-bottom': '14px' }}>
            <span style={{ color: '#5b6475', 'font-size': '13px' }}>Current state</span>
            <strong data-testid="seek-state" style={{ color: '#4338ca' }}>{String(state.state)}</strong>
          </div>
          <div style={{ display: 'grid', 'grid-template-columns': 'repeat(4, minmax(0, 1fr))', gap: '10px' }}>
            <Stat label="Playback" value={`${state.context.position}s`} testId="seek-position" />
            <Stat label="Target" value={state.context.target === null ? '—' : `${state.context.target}s`} />
            <Stat label="Request" value={state.context.activeRequest === null ? '—' : `#${state.context.activeRequest}`} />
            <Stat label="Stale ignored" value={String(state.context.ignored)} testId="ignored-count" />
          </div>
          <p data-testid="seek-result" style={{ margin: '14px 0 0', color: '#4c566a', 'font-size': '14px' }}>
            {state.context.result}
          </p>
        </section>

        <section style={cardStyle} aria-label="Overlapping seek steps">
          <h2 style={{ margin: '0 0 6px', 'font-size': '17px' }}>Run the race</h2>
          <p style={{ margin: '0 0 14px', color: '#5b6475', 'font-size': '14px' }}>
            Use the four buttons in order. Watch the state card and the open debug panel.
          </p>
          <div style={{ display: 'grid', 'grid-template-columns': 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
            <StepButton number="1" label="Request 30s (#1)" onClick={() => state.request(1, 30)} testId="request-one" />
            <StepButton number="2" label="Request 90s (#2)" onClick={() => state.request(2, 90)} testId="request-two" />
            <StepButton number="3" label="Complete #1 at 30s" onClick={() => state.resolve(1, 30)} testId="resolve-one" />
            <StepButton number="4" label="Complete #2 at 90s" onClick={() => state.resolve(2, 90)} testId="resolve-two" />
          </div>
          <button
            type="button"
            onClick={state.cancel}
            style={{ margin: '12px 0 0', border: 0, background: 'transparent', color: '#5b6475', cursor: 'pointer' }}
          >
            Cancel active seek
          </button>
        </section>
      </div>
    </main>
  );
}

function Stat(props: { label: string; value: string; testId?: string }) {
  return (
    <div use:viewRoot={'Stat'} style={{ background: '#f6f7fa', 'border-radius': '8px', padding: '10px' }}>
      <div style={{ color: '#697386', 'font-size': '11px', 'margin-bottom': '4px' }}>{props.label}</div>
      <strong data-testid={props.testId}>{props.value}</strong>
    </div>
  );
}

function StepButton(props: {
  number: string;
  label: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      use:viewRoot={'StepButton'}
      type="button"
      data-testid={props.testId}
      onClick={props.onClick}
      style={{
        display: 'flex',
        gap: '8px',
        'align-items': 'center',
        padding: '10px 12px',
        border: '1px solid #cbd1dc',
        'border-radius': '8px',
        background: '#fff',
        color: '#172033',
        cursor: 'pointer',
        'text-align': 'left'
      }}
    >
      <strong style={{ color: '#4338ca' }}>{props.number}.</strong>
      {props.label}
    </button>
  );
}

/** Mount the real machine, guided controls, and floating debug panel. */
export function DebugPanelMachineDemo() {
  // Artifact frames can deny storage. Open the panel after its provider mounts.
  onMount(() => {
    if (!document.querySelector('[data-testid=wheel-debug-panel]')) {
      (document.querySelector('[data-testid=wheel-debug-toggle]') as HTMLButtonElement | null)?.click();
    }
  });
  return (
    <ServiceProvider scopeId="machine-proof">
      <MachineProofControls />
      <WheelDebugPanel />
    </ServiceProvider>
  );
}

const proofConnection = () => ({});

/** Debug panel proof with current state, typed transitions, and stale-result handling. */
export default defineStates({
  name: 'DebugPanelMachineDemo',
  component: DebugPanelMachineDemo,
  connection: proofConnection,
  states: {
    'overlapping seeks': {
      note: 'Run requests #1 and #2, then finish #1 first. The machine ignores the stale result.',
      shape: {}
    },
    'field history': {
      note: 'Record a field-only write. The debug panel changes while the control render count stays at one.',
      shape: {}
    }
  }
});
