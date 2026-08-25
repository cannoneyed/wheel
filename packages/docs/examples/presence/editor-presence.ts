// #region declaration
import { presence, t } from 'wheel/sync';

export const editorPresence = presence({
  name: 'editor',
  state: t.object({
    blockId: t.string().nullable(),
    caretOffset: t.number().nullable(),
    previewText: t.string().nullable()
  })
});
// #endregion declaration

// #region service
import { SyncService } from 'wheel/sync';

export class EditorService extends SyncService {
         /** Identity that survives minification (see require-service-name). */
         static override serviceName = 'EditorService';

  readonly peersOn = this.clientReadFor((blockId: string) =>
    [...this.client.peers(editorPresence).valid.entries()]
      .filter(([, state]) => state.blockId === blockId)
      .map(([clientId, state]) => ({
        clientId,
        caretOffset: state.caretOffset
      }))
  );

  readonly setCaret = (blockId: string, caretOffset: number) =>
    this.client.setPresence(
      editorPresence,
      { blockId, caretOffset, previewText: null },
      { coalesceMs: 120 }
    );
}
// #endregion service
