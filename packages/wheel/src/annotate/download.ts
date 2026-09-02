/**
 * Delivery when there is no dev server: hand the note to the human as a file.
 *
 * A deployed app has no `/__wheel/note` endpoint to POST to, and shipping one
 * would mean collecting other people's application state on a server — which
 * is a decision with a privacy story attached, not a default. So production
 * annotation ends at a download: the file lands in the user's Downloads
 * folder, they drop it wherever their agent is looking, and nothing left the
 * machine that they did not move themselves.
 *
 * One file, not a directory, because a browser download is one file. The
 * screenshot is embedded and the payload rides along as a fenced JSON block
 * (`renderNoteFile`), so a downloaded note loses nothing an agent reads.
 */
import { logger } from '../core/logger';

/** Replaceable download implementation, so tests do not need a browser. */
type DownloadFile = (filename: string, text: string) => void;

let downloadFile: DownloadFile | null = null;

/** @internal Test/host seam: capture downloads instead of triggering them. */
export function setNoteDownload(download: DownloadFile | null): void {
  downloadFile = download;
}

/**
 * Save `text` as `filename` through the browser's download path.
 *
 * Blob URL plus a synthetic click is the only way to name a download from a
 * page; the URL is revoked on the next frame so the blob is not retained.
 */
export function downloadNote(filename: string, text: string): void {
  if (downloadFile) {
    downloadFile(filename, text);
    return;
  }
  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    requestAnimationFrame(() => URL.revokeObjectURL(url));
  } catch (error) {
    logger.warn('wheel: could not download the note', error);
  }
}
