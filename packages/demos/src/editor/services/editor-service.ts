/**
 * The editor feature service: the ONLY place this demo touches synced data.
 * Owns the block-list subscription, every document mutation (edit/split/
 * merge/kind/move/delete), sync-tied undo/redo with the D1 flush hook, the
 * presence channel (who is editing which block), and the feature's keyboard
 * shortcuts (mod+z / mod+shift+z).
 *
 * The tiptap editor is a PROJECTION of this service's rows — it renders
 * `list.rows` and calls these actions; it never stores document state itself.
 */
import { type ServiceContext } from 'wheel/core';
import { SyncService, positionBetween } from 'wheel/sync';
import { KeyboardService } from 'wheel/kit';
import {
  addBlock,
  blockList,
  deleteBlock,
  editBlock,
  editorPresence,
  mergeBlock,
  moveBlock,
  splitBlock,
  type Block,
  type Kind
} from '../sync/editor.sync';

export type { Block, Kind };

/** The editBlock patch shape (all fields optional — send what changed). */
export interface BlockPatch {
  text?: string;
  kind?: Kind;
  checked?: boolean | null;
  language?: string | null;
}

/** One peer's live editing state on a block: dot color + caret + selection + preview. */
export interface BlockPeer {
  clientId: string;
  color: string;
  /** Caret position in the block's markdown source, or null (just focused). */
  caretOffset: number | null;
  /** Selection anchor (same units); equals caretOffset when nothing is selected. */
  anchorOffset: number | null;
  /** Uncommitted typing peers render display-only, or null (not typing). */
  previewText: string | null;
}

/** Preview payloads above this size send caret-only (008 P4 guardrail). */
const PREVIEW_CAP_BYTES = 4096;

/** Stable per-peer dot color derived from the clientId. */
function peerColor(clientId: string): string {
  let hash = 0;
  for (let index = 0; index < clientId.length; index += 1) {
    hash = (hash * 31 + clientId.charCodeAt(index)) | 0;
  }
  // The point is 360 mutually distinguishable hues, one per peer — a fixed
  // token set has no way to express "as many colors as there are people".
  // wheel-color: per-peer identity hue derived from the clientId hash, not chrome
  return `hsl(${((hash % 360) + 360) % 360} 70% 45%)`;
}

/** Owns the block document subscription and every editor mutation (see module doc). */
export class EditorService extends SyncService {
  constructor(context: ServiceContext) {
    super(context);
    // Shortcuts live with the feature they drive. `inInputs: true` because
    // the editor IS an editable surface — undo/redo must fire (and
    // preventDefault, suppressing the browser's native contenteditable undo)
    // while focus sits in the document.
    const keyboardService = this.service(KeyboardService);
    this.addCleanup(
      keyboardService.register({
        id: 'editor.undo',
        key: 'mod+z',
        run: () => this.undo(),
        // NOT gated on canUndo alone: straight after typing (before the pause
        // commit) nothing is committed yet, so canUndo is false — but undo's
        // own D1 flush is what MAKES those keystrokes undoable. While the
        // editor is mounted (a flush hook is registered) mod+z must always
        // reach undo(), which also keeps the browser's native contenteditable
        // undo suppressed.
        when: () => this.canUndo() || this.flushHook.get() !== null,
        inInputs: true
      })
    );
    this.addCleanup(
      keyboardService.register({ id: 'editor.redo', key: 'mod+shift+z', run: () => this.redo(), when: this.canRedo, inInputs: true })
    );
  }

  /** The block-document subscription — read `list.rows` / `list.status` directly. */
  readonly list = this.liveQuery(blockList, {});

  // Doctrine: atoms hold data; runtime handles live in plain fields. The
  // flush hook is the editor component's "commit my uncommitted typing NOW"
  // callback — D1's trick: cmd+z flushes the dirty block as a mutation, then
  // undoes it, so every keystroke is undoable through wheel.
  private readonly flushHook = this.field<(() => void) | null>(null);

  /** One block by id, from the live list. */
  readonly block = this.computedFor((blockId: string): Block | undefined =>
    this.list.rows.find((row) => row.id === blockId)
  );

  // `clientRead`/`clientReadFor` ride the client's onChange → revision channel,
  // so these update whenever the client notifies (mutations, undos, presence).
  /** Whether an invertible local mutation is available to undo. */
  readonly canUndo = this.clientRead((): boolean => this.client.canUndo());
  /** Whether an undone mutation is available to redo. */
  readonly canRedo = this.clientRead((): boolean => this.client.canRedo());
  /** Other clients on one block: dot color, caret offset, live preview. Typed read — a peer on a mismatched schema surfaces in `.failures` instead of crashing. */
  readonly peersOn = this.clientReadFor((blockId: string): readonly BlockPeer[] =>
    [...this.client.peers(editorPresence).valid.entries()]
      .filter(([, state]) => state.blockId === blockId)
      .map(([clientId, state]) => ({
        clientId,
        color: peerColor(clientId),
        caretOffset: state.caretOffset,
        anchorOffset: state.anchorOffset,
        previewText: state.previewText
      }))
  );

  /** The editor component registers its flush-dirty-typing callback here. */
  registerFlushHook(hook: () => void): () => void {
    this.flushHook.set(hook);
    return () => {
      if (this.flushHook.get() === hook) {
        this.flushHook.set(null);
      }
    };
  }

  /** Insert a block after `afterBlockId` (or at the end). The id is minted HERE — args-borne, so the mutation can invert itself. */
  readonly add = (afterBlockId?: string, kind?: Kind): string => {
    const blockId = this.client.newId('block');
    // Sync args are JSON: omit absent optional fields instead of sending
    // JavaScript's non-serializable `undefined` (same rule as commit()) —
    // an undefined-valued key fails JSON validation and the whole mutation
    // settles `failed` without ever applying.
    this.mutate(addBlock, {
      blockId,
      ...(afterBlockId !== undefined ? { afterBlockId } : {}),
      ...(kind !== undefined ? { kind } : {}),
      ...(kind === 'todo' ? { checked: false } : {})
    });
    return blockId;
  };

  /**
   * Commit one block edit as a single undo step. `baseVersion` is the
   * version the edit was BASED on (dirty-typing start), not necessarily the
   * row's current version — that gap is exactly the conflict signal (D3).
   * No-ops when nothing would change, so blur never pollutes the undo stack.
   */
  readonly commit = (blockId: string, patch: BlockPatch, baseVersion?: number): void => {
    const row = this.block(blockId);
    if (!row) {
      return;
    }
    // Sync payloads are JSON: omit optional fields instead of sending
    // JavaScript's non-serializable `undefined`.
    const definedPatch = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined)
    ) as BlockPatch;
    const changed = Object.entries(definedPatch).some(
      ([field, value]) => row[field as keyof BlockPatch] !== value
    );
    if (!changed) {
      return;
    }
    this.mutate(editBlock, { blockId, baseVersion: baseVersion ?? row.version, patch: definedPatch });
  };

  /**
   * Turn a block into another kind. Kind-specific fields reset with it:
   * todos gain `checked: false`, code keeps its language, everything else
   * clears both. `text` rides along so uncommitted typing lands in the same
   * undo step as the kind change.
   */
  readonly setKind = (blockId: string, kind: Kind, text?: string): void => {
    const row = this.block(blockId);
    if (!row) {
      return;
    }
    this.commit(blockId, {
      kind,
      text: kind === 'divider' ? '' : text,
      checked: kind === 'todo' ? (row.checked ?? false) : null,
      language: kind === 'code' ? row.language : null
    });
  };

  /** Toggle/set a todo's checkbox. One mutation, one undo step. */
  readonly setChecked = (blockId: string, checked: boolean): void => {
    this.commit(blockId, { checked });
  };

  /**
   * Enter mid-block (D2): ONE mutation writes both rows — this block keeps
   * `textBefore`, a new block lands after it. Returns the new block's id so
   * the editor can place the cursor in it.
   */
  readonly split = (blockId: string, textBefore: string, newText: string, newKind: Kind, baseVersion?: number): string | null => {
    const row = this.block(blockId);
    if (!row) {
      return null;
    }
    const newBlockId = this.client.newId('block');
    this.mutate(splitBlock, {
      blockId,
      baseVersion: baseVersion ?? row.version,
      textBefore,
      newBlockId,
      newKind,
      newText,
      newChecked: newKind === 'todo' ? false : null
    });
    return newBlockId;
  };

  /** Backspace at block start (D2): `blockId` absorbs `mergedText`, `removeBlockId` disappears — one mutation, one undo step. */
  readonly merge = (blockId: string, mergedText: string, removeBlockId: string, baseVersion?: number): void => {
    const row = this.block(blockId);
    if (!row) {
      return;
    }
    this.mutate(mergeBlock, { blockId, baseVersion: baseVersion ?? row.version, mergedText, removeBlockId });
  };

  /** Delete a block. Undo restores it byte-exactly — kind, text, position, version. */
  readonly remove = (blockId: string): void => {
    this.mutate(deleteBlock, { blockId });
  };

  /** Swap a block above its predecessor: one fractional-position write. */
  readonly moveUp = (blockId: string): void => {
    const rows = this.list.rows;
    const index = rows.findIndex((row) => row.id === blockId);
    if (index <= 0) {
      return;
    }
    this.mutate(moveBlock, {
      blockId,
      position: positionBetween(rows[index - 2]?.position, rows[index - 1].position)
    });
  };

  /** Swap a block below its successor: one fractional-position write. */
  readonly moveDown = (blockId: string): void => {
    const rows = this.list.rows;
    const index = rows.findIndex((row) => row.id === blockId);
    if (index < 0 || index >= rows.length - 1) {
      return;
    }
    this.mutate(moveBlock, {
      blockId,
      position: positionBetween(rows[index + 1].position, rows[index + 2]?.position)
    });
  };

  /**
   * Undo (D1): flush uncommitted typing FIRST — it becomes the newest undo
   * entry — then undo. Every keystroke is thereby undoable through wheel:
   * synced, cross-client, no editor-local history.
   */
  readonly undo = (): void => {
    this.flushHook.get()?.();
    this.client.undo();
  };

  /** Redo the latest undone mutation. (No flush: a fresh commit would legitimately clear the redo stack.) */
  readonly redo = (): void => {
    this.client.redo();
  };

  /**
   * Publish this client's live editing state (008 P3). Ephemeral — no rows,
   * no history, dies with the connection. Coalesced at 120ms (leading +
   * trailing, latest wins), so per-keystroke calls cost about 8 messages per second.
   * Oversized previews send caret-only (P4 cap); `blockId: null` (blur)
   * sends immediately so peers never see a stale caret linger.
   */
  readonly publishCursor = (
    blockId: string | null,
    caretOffset: number | null = null,
    anchorOffset: number | null = null,
    previewText: string | null = null
  ): void => {
    if (blockId === null) {
      this.client.setPresence(editorPresence, {
        blockId: null,
        caretOffset: null,
        anchorOffset: null,
        previewText: null
      });
      return;
    }
    const capped = previewText !== null && previewText.length > PREVIEW_CAP_BYTES ? null : previewText;
    this.client.setPresence(
      editorPresence,
      { blockId, caretOffset, anchorOffset: anchorOffset ?? caretOffset, previewText: capped },
      { coalesceMs: 120 }
    );
  };
}
