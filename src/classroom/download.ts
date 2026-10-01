/**
 * Browser download helpers (DOM). The file is created in the browser; nothing
 * is sent to a server.
 */
import type { ProgressApi } from '../shared/progress';
import { localDate } from './format';
import { progressFileName } from './progressFile';

export type DownloadFn = (fileName: string, content: string, mimeType: string) => void;

/** Save text as a file through a temporary link. */
export const downloadText: DownloadFn = (fileName, content, mimeType) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/**
 * Download the player's progress as "<handle>-<date>.gitquest.json"
 * (used by the game's "Export progress" button). Returns the file name.
 */
export function downloadProgress(api: ProgressApi, download: DownloadFn = downloadText, now: Date = new Date()): string {
  const name = progressFileName(api.get(), localDate(now));
  download(name, api.exportFile(), 'application/json');
  return name;
}
