// @vitest-environment jsdom
/**
 * The dialog system's three doors: promise built-ins (confirm/alert),
 * imperative typed openDialog, and declarative owner-captured <Dialog> —
 * plus scrim/Escape dismissal semantics and single-open.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'solid-js/web';

import { Service, ServiceProvider, connect, fakeService, view } from '../core/index';
import { CommandPaletteService, CommandPaletteSystem, Dialog, DialogService, DialogSystem } from './index';
class ProbeService extends Service {
  readonly dialogs = this.computed(() => this.context.get(DialogService), 'dialogs');
}

function mountApp(children: (dialogs: DialogService) => ReturnType<typeof DialogSystem>) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  let dialogs!: DialogService;
  const connectGrab = connect('DialogProbe', (c) => {
    dialogs = c.service(ProbeService).dialogs();
    return {};
  });
  function Grab() {
    connectGrab({});
    return null;
  }
  const dispose = render(
    () => (
      <ServiceProvider scopeId="dialog-test">
        <Grab />
        {children(dialogs)}
        <DialogSystem />
      </ServiceProvider>
    ),
    host
  );
  return {
    host,
    dialogs,
    cleanup: () => {
      dispose();
      host.remove();
    }
  };
}

const overlay = () => document.querySelector('[data-testid=wheel-dialog-overlay]');

describe('dialog built-ins', () => {
  it('confirm resolves true on confirm, false on Escape, and renders the kit view', async () => {
    const { dialogs, cleanup } = mountApp(() => null);
    try {
      const first = dialogs.confirm('Delete this item?', { danger: true, confirmLabel: 'Delete' });
      expect(overlay()).not.toBeNull();
      expect(overlay()!.textContent).toContain('Delete this item?');
      const buttons = [...overlay()!.querySelectorAll('button')];
      buttons.find((b) => b.textContent === 'Delete')!.click();
      await expect(first).resolves.toBe(true);
      expect(overlay()).toBeNull();

      const second = dialogs.confirm('Sure?');
      document.activeElement?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      );
      await expect(second).resolves.toBe(false);
      expect(overlay()).toBeNull();
    } finally {
      cleanup();
    }
  });

  it('settles every replaced built-in with its dismiss value', async () => {
    const { dialogs, cleanup } = mountApp(() => null);
    function CustomDialog() {
      return <div role="dialog">custom</div>;
    }
    try {
      const confirmToConfirm = dialogs.confirm('first');
      const replacementConfirm = dialogs.confirm('second');
      await expect(confirmToConfirm).resolves.toBe(false);
      expect(overlay()!.textContent).toContain('second');
      dialogs.close();
      await expect(replacementConfirm).resolves.toBe(false);

      const confirmToAlert = dialogs.confirm('third');
      const replacementAlert = dialogs.alert('alert');
      await expect(confirmToAlert).resolves.toBe(false);
      expect(overlay()!.textContent).toContain('alert');
      dialogs.close();
      await expect(replacementAlert).resolves.toBeUndefined();

      const confirmToCustom = dialogs.confirm('fourth');
      dialogs.openDialog('custom', CustomDialog, {});
      await expect(confirmToCustom).resolves.toBe(false);
      expect(overlay()!.textContent).toContain('custom');
    } finally {
      cleanup();
    }
  });

  it('rejects duplicate declarative ids with both declaration sites', () => {
    const { dialogs, cleanup } = mountApp(() => null);
    try {
      const unregister = dialogs.register({
        id: 'duplicate',
        owner: null,
        render: () => null,
        declaredAt: 'first-dialog.tsx:10'
      });
      expect(() =>
        dialogs.register({
          id: 'duplicate',
          owner: null,
          render: () => null,
          declaredAt: 'second-dialog.tsx:20'
        })
      ).toThrow(/Duplicate dialog id 'duplicate'.*first-dialog.*second-dialog/);
      unregister();
    } finally {
      cleanup();
    }
  });

  it('moves focus in, traps Tab, closes on Escape, and restores focus', async () => {
    const { host, dialogs, cleanup } = mountApp(() => (
      <button data-testid="outside">outside</button>
    ));
    try {
      const outside = host.querySelector('[data-testid=outside]') as HTMLButtonElement;
      outside.focus();
      const result = dialogs.confirm('Focus contract');
      const buttons = [...overlay()!.querySelectorAll('button')];
      expect(document.activeElement).toBe(buttons[0]);

      buttons[0].dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
      );
      expect(document.activeElement).toBe(buttons[1]);
      buttons[1].dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
      );
      expect(document.activeElement).toBe(buttons[0]);

      buttons[0].dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      );
      await expect(result).resolves.toBe(false);
      expect(overlay()).toBeNull();
      expect(document.activeElement).toBe(outside);
    } finally {
      cleanup();
    }
  });

  it('alert resolves on OK; scrim click dismisses; content clicks do not', async () => {
    const { dialogs, cleanup } = mountApp(() => null);
    try {
      const acknowledged = dialogs.alert('Saved!', { title: 'Done' });
      expect(overlay()!.textContent).toContain('Saved!');
      // Clicking INSIDE the panel must not dismiss.
      (overlay()!.querySelector('[role=dialog]') as HTMLElement).click();
      expect(overlay()).not.toBeNull();
      (overlay() as HTMLElement).click(); // the scrim itself
      await expect(acknowledged).resolves.toBeUndefined();
      expect(overlay()).toBeNull();
    } finally {
      cleanup();
    }
  });
});

describe('custom dialogs', () => {
  it('openDialog renders a typed component with closure props; single-open holds', () => {
    const deleted: string[] = [];
    function DeleteItemDialog(props: { itemId: string; confirm: () => void; cancel: () => void }) {
      return (
        <div role="dialog">
          <div>Delete {props.itemId}?</div>
          <button onClick={props.cancel}>Cancel</button>
          <button onClick={props.confirm}>Delete</button>
        </div>
      );
    }
    const { dialogs, cleanup } = mountApp(() => null);
    try {
      dialogs.openDialog('delete-item', DeleteItemDialog, {
        itemId: 'card_1',
        confirm: () => {
          deleted.push('card_1');
          dialogs.closeDialog('delete-item');
        },
        cancel: () => dialogs.closeDialog('delete-item')
      });
      expect(overlay()!.textContent).toContain('Delete card_1?');

      // Opening a second dialog replaces the first (scalar atom).
      void dialogs.confirm('replace');
      expect(document.querySelectorAll('[data-testid=wheel-dialog-overlay]').length).toBe(1);
      expect(overlay()!.textContent).toContain('replace');
      dialogs.close();

      dialogs.openDialog('delete-item', DeleteItemDialog, {
        itemId: 'card_1',
        confirm: () => {
          deleted.push('card_1');
          dialogs.closeDialog('delete-item');
        },
        cancel: () => dialogs.closeDialog('delete-item')
      });
      [...overlay()!.querySelectorAll('button')].find((b) => b.textContent === 'Delete')!.click();
      expect(deleted).toEqual(['card_1']);
      expect(overlay()).toBeNull();
    } finally {
      cleanup();
    }
  });

  it('declarative <Dialog> keeps its declaration-site context (scoped-override flavor)', () => {
    class LabelService extends Service {
      readonly label = this.computed(() => 'from-the-service', 'label');
    }
    const connectScopedDialog = connect('ScopedDialogContent', (c) => {
      const labelService = c.service(LabelService);
      return view({ label: () => labelService.label() });
    });
    function ScopedDialogContent() {
      const state = connectScopedDialog({});
      return (
        <div role="dialog">label: {state.label}</div>
      );
    }
    const scopedLabel = fakeService(LabelService, {
      label: (() => 'from-the-subtree') as LabelService['label']
    });
    const { dialogs, cleanup } = mountApp(() => (
      <ServiceProvider
        scopeId="scoped-dialog"
        overrides={[{ original: LabelService, replacement: scopedLabel, ownership: 'caller' }]}
      >
        <Dialog id="scoped-dialog" content={() => <ScopedDialogContent />} />
      </ServiceProvider>
    ));
    try {
      dialogs.open('scoped-dialog');
      // The dialog's DOM is portaled at body, but its content resolved the
      // OVERRIDDEN service from the <Dialog> declaration site inside the scope.
      expect(overlay()!.textContent).toContain('label: from-the-subtree');
      dialogs.close();
      expect(() => dialogs.open('missing')).toThrow(/no <Dialog id="missing">/);
    } finally {
      cleanup();
    }
  });
});

describe('dialog layering', () => {
  it('draws ABOVE the command palette, which is what usually opens it', async () => {
    // A dialog filed from the palette drew UNDER the palette that launched
    // it: the palette sat at 9_500 and the dialog at 9_000. A launcher must
    // never cover the thing it launched.
    const { dialogs, cleanup } = mountApp(() => <CommandPaletteSystem />);
    try {
      dialogs.openDialog('probe', () => <p>body</p>, {});
      await Promise.resolve();
      const dialogZ = Number((overlay() as HTMLElement).style.zIndex);
      expect(dialogZ).toBe(9_600);
      // Still under the layers a dialog's own content raises.
      expect(dialogZ).toBeLessThan(10_000);
    } finally {
      cleanup();
    }
  });

  it('launching a dialog from a command palette action closes the palette overlay', () => {
    let paletteService!: import('./command-palette').CommandPaletteService;
    class PaletteGrabber extends Service {
      readonly palette = this.computed(() => this.context.get(CommandPaletteService), 'palette');
    }
    const connectGrabPalette = connect('PaletteGrabProbe', (c) => {
      paletteService = c.service(PaletteGrabber).palette();
      return {};
    });
    function GrabPalette() {
      connectGrabPalette({});
      return null;
    }
    const { dialogs, cleanup } = mountApp(() => (
      <>
        <GrabPalette />
        <CommandPaletteSystem />
      </>
    ));
    try {
      paletteService.registerCommand({
        id: 'issue.new',
        title: 'New issue',
        run: () => {
          dialogs.openDialog('new-issue', () => <div data-testid="new-issue-body">Issue dialog</div>, {});
        }
      });
      paletteService.open();
      expect(document.querySelector('[data-testid=wheel-palette-overlay]')).not.toBeNull();
      paletteService.run('issue.new');
      expect(paletteService.isOpen.get()).toBe(false);
      expect(document.querySelector('[data-testid=wheel-palette-overlay]')).toBeNull();
      expect(overlay()).not.toBeNull();
      expect(overlay()!.textContent).toContain('Issue dialog');
    } finally {
      cleanup();
    }
  });
});
