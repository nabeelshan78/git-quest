/**
 * Browser download helpers (DOM) for the "Export my progress" button.
 * The files are created in the browser; nothing is sent to a server.
 */
import type { ProgressApi } from '../shared/progress';
import { localDate, progressFileName } from './progressFile';

export type DownloadFn = (fileName: string, content: string, mimeType: string) => void;

export type ExportFormat = 'json' | 'csv';

const MIME_TYPES: Record<ExportFormat, string> = {
  json: 'application/json',
  csv: 'text/csv;charset=utf-8',
};

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

export interface DownloadOptions {
  /** How the file is saved (default: a browser download). */
  download?: DownloadFn;
  now?: Date;
}

/**
 * Download the player's progress as "<handle>-<date>.gitquest.json" or
 * "<handle>-<date>.gitquest.csv". Returns the file name.
 */
export function downloadProgress(api: ProgressApi, format: ExportFormat = 'json', options: DownloadOptions = {}): string {
  const download = options.download ?? downloadText;
  const name = progressFileName(api.get(), localDate(options.now ?? new Date()), format);
  download(name, format === 'csv' ? api.exportCsv() : api.exportFile(), MIME_TYPES[format]);
  return name;
}

/** Download both files (JSON and CSV). Returns the two file names. */
export function downloadAllProgress(api: ProgressApi, options: DownloadOptions = {}): string[] {
  return [downloadProgress(api, 'json', options), downloadProgress(api, 'csv', options)];
}
