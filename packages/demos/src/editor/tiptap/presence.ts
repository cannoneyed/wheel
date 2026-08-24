/**
 * Live peer state rendered INSIDE the editor as ProseMirror decorations
 * (008 P3): presence dots, colored carets, and the typing preview.
 *
 * Why decorations and not Solid JSX: this all lives inside the
 * contenteditable — anything Solid rendered there would be editor "content"
 * PM tries to reconcile away. Decorations are PM's own channel for exactly
 * this: view chrome overlaid on content, ignored by the document model.
 *
 * The preview is PIXELS, not state: while a peer has uncommitted typing in
 * a block, the block's committed text is hidden (inline decoration) and the
 * peer's preview text — with their caret in it — shows in its place
 * (widget). The viewer's document is never written; on the peer's commit
 * the synced row catches up and the preview evaporates. Blocks under
 * preview are pointer-inert (CSS): you can't click into text that isn't
 * really there.
 *
 * The component pushes a fresh blockId → peers map via `updatePresence`
 * whenever the presence computed changes (having already stripped
 * caret/preview for the viewer's own dirty block — their typing wins the
 * display there, per the dirty-block rule).
 */
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

import type { BlockPeer } from '../services/editor-service';

export type PresenceMap = ReadonlyMap<string, readonly BlockPeer[]>;

const presenceKey = new PluginKey<PresenceMap>('wheelPresence');

/** Push the latest blockId → peers map into the editor. */
export function updatePresence(view: EditorView, map: PresenceMap): void {
  view.dispatch(view.state.tr.setMeta(presenceKey, map).setMeta('addToHistory', false));
}

function dotsWidget(peers: readonly BlockPeer[]): HTMLElement {
  const holder = document.createElement('span');
  holder.className = 'peer-dots';
  holder.contentEditable = 'false';
  for (const peer of peers) {
    const dot = document.createElement('span');
    dot.className = 'peer-dot';
    dot.title = `${peer.clientId} is editing`;
    dot.style.background = peer.color;
    holder.append(dot);
  }
  return holder;
}

function caretElement(color: string, clientId: string): HTMLElement {
  const caret = document.createElement('span');
  caret.className = 'peer-caret';
  caret.title = clientId;
  caret.style.background = color;
  caret.contentEditable = 'false';
  return caret;
}

/** The peer's uncommitted text with their caret inside it, replacing the block's display. */
function previewWidget(peer: BlockPeer): HTMLElement {
  const holder = document.createElement('span');
  holder.className = 'peer-preview';
  holder.contentEditable = 'false';
  const text = peer.previewText ?? '';
  const at = Math.max(0, Math.min(peer.caretOffset ?? text.length, text.length));
  holder.append(document.createTextNode(text.slice(0, at)));
  holder.append(caretElement(peer.color, peer.clientId));
  holder.append(document.createTextNode(text.slice(at)));
  return holder;
}

function decorateBlock(decorations: Decoration[], node: ProseMirrorNode, pos: number, peers: readonly BlockPeer[]): void {
  decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: 'has-peers' }));
  if (node.isAtom) {
    return; // divider: the node class (tinted) is all the room there is
  }
  decorations.push(Decoration.widget(pos + 1, () => dotsWidget(peers), { key: peersKey('dots', peers), side: -1 }));

  const previewing = peers.find((peer) => peer.previewText !== null);
  if (previewing) {
    // Hide the committed text (inline decoration wraps it in a styled span)
    // and show the preview in its place.
    decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: 'has-preview' }));
    if (node.content.size > 0) {
      decorations.push(Decoration.inline(pos + 1, pos + 1 + node.content.size, { class: 'preview-hidden' }));
    }
    decorations.push(
      Decoration.widget(pos + 1, () => previewWidget(previewing), { key: peersKey('preview', [previewing]), side: 0 })
    );
    return;
  }
  // No preview: focused peers' carets (and selection ranges) sit in the
  // committed text. Offsets are markdown-source characters; clamping to
  // content size keeps them sane when marks make source longer than the doc
  // text.
  for (const peer of peers) {
    if (peer.caretOffset === null) {
      continue;
    }
    const head = pos + 1 + Math.min(peer.caretOffset, node.content.size);
    const anchor = pos + 1 + Math.min(peer.anchorOffset ?? peer.caretOffset, node.content.size);
    if (anchor !== head) {
      decorations.push(
        Decoration.inline(Math.min(anchor, head), Math.max(anchor, head), {
          class: 'peer-selection',
          style: `background: color-mix(in srgb, ${peer.color} 22%, transparent)`
        })
      );
    }
    decorations.push(
      Decoration.widget(head, () => caretElement(peer.color, peer.clientId), {
        key: `caret:${peer.clientId}:${head}`,
        side: 0
      })
    );
  }
}

/** Stable-ish widget key so unchanged peer state doesn't rebuild DOM every pass. */
function peersKey(prefix: string, peers: readonly BlockPeer[]): string {
  return `${prefix}:${peers
    .map((peer) => `${peer.clientId}@${peer.caretOffset ?? ''}~${peer.anchorOffset ?? ''}#${peer.previewText?.length ?? ''}`)
    .join(',')}`;
}

export const PresenceExtension = Extension.create({
  name: 'wheelPresence',

  addProseMirrorPlugins() {
    return [
      new Plugin<PresenceMap>({
        key: presenceKey,
        state: {
          init: () => new Map(),
          apply: (tr, previous) => (tr.getMeta(presenceKey) as PresenceMap | undefined) ?? previous
        },
        props: {
          decorations(state) {
            const map = presenceKey.getState(state);
            if (!map || map.size === 0) {
              return null;
            }
            const decorations: Decoration[] = [];
            state.doc.forEach((node, pos) => {
              const peers = map.get(node.attrs.blockId as string);
              if (peers && peers.length > 0) {
                decorateBlock(decorations, node, pos, peers);
              }
            });
            return DecorationSet.create(state.doc, decorations);
          }
        }
      })
    ];
  }
});
