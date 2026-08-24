/**
 * The generic panel views behind the confirm/alert built-ins, plus the
 * private layout pieces they render. Inline-styled on purpose — kernel
 * drop-ins work with zero build configuration — but every color reads a
 * `--wheel-dialog-*` custom property first, then the matching design token
 * (`--wheel-bg-raised`, `--wheel-ink`, `--wheel-accent`, …), then the original
 * light literal. Three tiers, one line: a host that sets `--wheel-dialog-*`
 * still wins; a host that only imports `wheel/styles` gets a dialog that
 * follows the theme; a host that does neither gets the original light look.
 * These pieces are NOT part
 * of the public API: only ConfirmDialogView/AlertDialogView are exported,
 * and only dialog.tsx consumes them.
 */
import { type JSX } from 'solid-js';

import { Show } from '../core/visibility';
import { viewRoot } from '../core/connect';

import type { ConfirmOptions } from './dialog';

/** The dialog panel: themed card, radius, shadow. @internal */
function DialogWrapper(props: { children: JSX.Element; class?: string }): JSX.Element {
  return (
    <div
      use:viewRoot={{ name: 'DialogWrapper', group: 'framework', props }}
      role="dialog"
      aria-modal="true"
      class={props.class}
      style={{
        background: 'var(--wheel-dialog-bg, var(--wheel-bg-raised, white))',
        color: 'var(--wheel-dialog-fg, var(--wheel-ink, inherit))',
        'border-radius': '10px',
        padding: '20px',
        'min-width': '320px',
        'max-width': '480px',
        'box-shadow': 'var(--wheel-shadow-stage, 0 16px 48px rgba(0,0,0,0.2))'
      }}
    >
      {props.children}
    </div>
  );
}

/** Title row. `type="alert"` tints it as destructive/attention. @internal */
function DialogHeader(props: { children?: JSX.Element; type?: 'default' | 'alert' }): JSX.Element {
  return (
    <Show when={props.children}>
      <h2
        use:viewRoot={{ name: 'DialogHeader', group: 'framework', props }}
        style={{
          margin: '0 0 12px',
          'font-size': '16px',
          color: props.type === 'alert' ? 'var(--wheel-dialog-danger, var(--wheel-danger-deep, #b91c1c))' : 'inherit'
        }}
      >
        {props.children}
      </h2>
    </Show>
  );
}

/** Body copy. @internal */
function DialogBody(props: { children: JSX.Element }): JSX.Element {
  return (
    <div use:viewRoot={{ name: 'DialogBody', group: 'framework', props }} style={{ margin: '0 0 16px', 'font-size': '14px' }}>
      {props.children}
    </div>
  );
}

/** Action row; `align` defaults to 'right'. @internal */
function DialogActions(props: { children: JSX.Element; align?: 'left' | 'right' }): JSX.Element {
  return (
    <div
      use:viewRoot={{ name: 'DialogActions', group: 'framework', props }}
      style={{ display: 'flex', gap: '8px', 'justify-content': props.align === 'left' ? 'flex-start' : 'flex-end' }}
    >
      {props.children}
    </div>
  );
}

/** A kit button: `type` picks the visual (confirm / cancel / danger). @internal */
function DialogActionButton(props: {
  type?: 'confirm' | 'cancel' | 'danger';
  onClick: () => void;
  children: JSX.Element;
}): JSX.Element {
  const styleFor = (): JSX.CSSProperties => {
    if (props.type === 'danger') {
      return {
        border: '1px solid var(--wheel-dialog-danger, var(--wheel-danger, #ef4444))',
        color: 'var(--wheel-dialog-danger, var(--wheel-danger, #ef4444))',
        background: 'var(--wheel-dialog-bg, var(--wheel-bg-raised, #fff))'
      };
    }
    if (props.type === 'confirm') {
      return {
        border: '1px solid var(--wheel-dialog-accent, var(--wheel-accent, #4f46e5))',
        color: 'var(--wheel-dialog-on-accent, var(--wheel-on-accent, #fff))',
        background: 'var(--wheel-dialog-accent, var(--wheel-accent, #4f46e5))'
      };
    }
    return {
      border: '1px solid var(--wheel-dialog-line, var(--wheel-line, #e4e7ec))',
      color: 'inherit',
      background: 'var(--wheel-dialog-bg, var(--wheel-bg-raised, #fff))'
    };
  };
  return (
    <button
      use:viewRoot={{ name: 'DialogActionButton', group: 'framework', props }}
      style={{ font: 'inherit', padding: '5px 14px', 'border-radius': '6px', cursor: 'pointer', ...styleFor() }}
      onClick={() => props.onClick()}
    >
      {props.children}
    </button>
  );
}

/** The generic view behind `dialogs.confirm(...)`. @internal */
export function ConfirmDialogView(props: {
  message: string;
  options: ConfirmOptions;
  respond: (value: boolean) => void;
}): JSX.Element {
  return (
    <DialogWrapper>
      <DialogHeader type={props.options.danger ? 'alert' : 'default'}>{props.options.title}</DialogHeader>
      <DialogBody>{props.message}</DialogBody>
      <DialogActions>
        <DialogActionButton type="cancel" onClick={() => props.respond(false)}>
          {props.options.cancelLabel ?? 'Cancel'}
        </DialogActionButton>
        <DialogActionButton type={props.options.danger ? 'danger' : 'confirm'} onClick={() => props.respond(true)}>
          {props.options.confirmLabel ?? 'Confirm'}
        </DialogActionButton>
      </DialogActions>
    </DialogWrapper>
  );
}

/** The generic view behind `dialogs.alert(...)`. @internal */
export function AlertDialogView(props: {
  message: string;
  options: Pick<ConfirmOptions, 'title' | 'confirmLabel'>;
  respond: () => void;
}): JSX.Element {
  return (
    <DialogWrapper>
      <DialogHeader>{props.options.title}</DialogHeader>
      <DialogBody>{props.message}</DialogBody>
      <DialogActions>
        <DialogActionButton type="confirm" onClick={() => props.respond()}>
          {props.options.confirmLabel ?? 'OK'}
        </DialogActionButton>
      </DialogActions>
    </DialogWrapper>
  );
}
