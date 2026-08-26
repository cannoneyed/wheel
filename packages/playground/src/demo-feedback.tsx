import { createContext, For, onCleanup, useContext, type Accessor, type JSX } from 'solid-js';
import { Toast } from 'wheel/components';
import { systemDefer } from 'wheel/core';

type DemoFeedback = (message: string) => void;

const DemoFeedbackContext = createContext<DemoFeedback>(() => undefined);

function readableText(value: string | null | undefined): string | null {
  const text = value?.replace(/\s+/g, ' ').trim();
  return text && text !== 'undefined' && text !== 'null' ? text : null;
}

function labelledByText(control: Element): string | null {
  const ids = control.getAttribute('aria-labelledby')?.split(/\s+/).filter(Boolean) ?? [];
  return readableText(ids.map((id) => document.getElementById(id)?.textContent).join(' '));
}

function nativeLabelText(control: Element): string | null {
  if (!(control instanceof HTMLInputElement) || control.labels === null) {
    return null;
  }
  return readableText(Array.from(control.labels, (label) => label.textContent).join(' '));
}

function controlLabel(control: Element): string {
  return (
    readableText(control.getAttribute('aria-label')) ??
    labelledByText(control) ??
    nativeLabelText(control) ??
    readableText(control.closest('label')?.textContent) ??
    readableText(control.getAttribute('title')) ??
    readableText(control.textContent) ??
    (control instanceof HTMLInputElement ? readableText(control.value) : null) ??
    'Action'
  );
}

function controlState(control: Element): string | null {
  const checked = readableText(control.getAttribute('aria-checked'));
  if (checked !== null) {
    return `checked: ${checked}`;
  }
  if (control instanceof HTMLInputElement && ['checkbox', 'radio'].includes(control.type)) {
    return `checked: ${control.checked}`;
  }

  const pressed = readableText(control.getAttribute('aria-pressed'));
  if (pressed !== null) {
    return `pressed: ${pressed}`;
  }

  const selected = readableText(control.getAttribute('aria-selected'));
  if (selected !== null) {
    return `selected: ${selected}`;
  }

  const expanded = readableText(control.getAttribute('aria-expanded'));
  return expanded === null ? null : `expanded: ${expanded}`;
}

function actionMessage(control: Element, label: string): string {
  const state = controlState(control);
  return state === null ? `${label} triggered.` : `${label} — ${state}`;
}

/** Reports contained demo actions without connecting them to application data. */
export function DemoFeedbackProvider(props: { readonly children: JSX.Element }): JSX.Element {
  const toastManager = Toast.createToastManager();
  const notify = (message: string) => toastManager.add({
    id: 'component-demo-feedback',
    title: message,
    timeout: 1_500,
  });

  return (
    <Toast.Provider toastManager={toastManager} timeout={1_500}>
      <DemoFeedbackContext.Provider value={notify}>
        {props.children}
      </DemoFeedbackContext.Provider>
      <Toast.Portal>
        <Toast.Viewport class="component-demo-toast-viewport">
          <DemoToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}

function DemoToastList(): JSX.Element {
  const { toasts } = Toast.useToastManager();
  return (
    <For each={toasts()}>
      {(toast) => (
        <Toast.Root toast={toast} data-testid="demo-snackbar">
          <Toast.Content>
            <Toast.Title />
          </Toast.Content>
        </Toast.Root>
      )}
    </For>
  );
}

/** Captures an action inside a demo, blocks navigation or submit effects, and reports the action. */
export function useDemoActionFeedback(): (event: MouseEvent) => void {
  const notify = useContext(DemoFeedbackContext);
  return (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const control = target.closest(
      'button, a, input, select, textarea, [role="button"], [role="menuitem"], [role="option"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"]',
    );
    if (
      !control ||
      !(event.currentTarget instanceof Element) ||
      !event.currentTarget.contains(control)
    ) {
      return;
    }

    if (
      control instanceof HTMLAnchorElement ||
      (control instanceof HTMLButtonElement && ['submit', 'reset'].includes(control.type)) ||
      (control instanceof HTMLInputElement && ['submit', 'reset'].includes(control.type))
    ) {
      event.preventDefault();
    }

    const label = controlLabel(control);
    systemDefer.schedule(0, () => notify(actionMessage(control, label)));
  };
}

/** Observes clicks before a demo component can stop event propagation. */
export function demoActionSurface(
  element: HTMLElement,
  feedback: Accessor<(event: MouseEvent) => void>,
): void {
  const handleClick = (event: MouseEvent) => feedback()(event);
  element.addEventListener('click', handleClick, true);
  onCleanup(() => element.removeEventListener('click', handleClick, true));
}

declare module 'solid-js' {
  namespace JSX {
    interface Directives {
      demoActionSurface: (event: MouseEvent) => void;
    }
  }
}
