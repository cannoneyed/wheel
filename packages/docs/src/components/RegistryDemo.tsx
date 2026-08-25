/**
 * Shows the debug registry doing its job: every primitive, its owning
 * service, and every component's declared dependencies — the audit surface
 * the whole architecture exists to protect.
 */
import { For } from 'solid-js';
import { Service, ServiceContext, systemRandom01, useSignal, viewRoot } from 'wheel/core';

class SelectionService extends Service {
  /** Identity that survives minification (see require-service-name). */
  static override serviceName = 'SelectionService';

  readonly selected = this.atom(new Set<string>(), 'selected');
  readonly count = this.computed(() => this.selected.get().size, 'count');
  readonly toggle = this.action((id: string) => {
    const next = new Set(this.selected.get());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.selected.set(next);
  }, 'toggle');
}

export function RegistryDemo() {
  const context = new ServiceContext({ scopeId: 'docs-registry' });
  const selection = context.get(SelectionService);
  const [tick, setTick] = useSignal(0, 'tick');

  const snapshot = () => {
    tick();
    return context.registry.snapshot();
  };

  return (
    <div use:viewRoot={'RegistryDemo'} class="demo">
      <div class="demo-label">Live demo — the registry sees every primitive</div>
      <button
        onClick={() => {
          selection.toggle(`row_${Math.floor(systemRandom01() * 3) + 1}`);
          setTick((t) => t + 1);
        }}
      >
        toggle a random row
      </button>
      <table style="margin-top: 14px">
        <thead>
          <tr>
            <th>primitive</th>
            <th>kind</th>
            <th>service</th>
            <th>current value</th>
          </tr>
        </thead>
        <tbody>
          <For each={snapshot().primitives}>
            {(entry) => (
              <tr>
                <td>
                  <code>{entry.meta.name}</code>
                </td>
                <td>{entry.meta.kind}</td>
                <td>{entry.meta.serviceName ?? '—'}</td>
                <td>
                  <code>{formatValue(entry.value)}</code>
                </td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value instanceof Set) return `Set{${[...value].join(', ')}}`;
  if (typeof value === 'string') return value;
  return JSON.stringify(value) ?? String(value);
}
