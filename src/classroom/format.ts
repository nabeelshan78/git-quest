/**
 * Display formatting for the dashboard (pure).
 */
import type { Translate } from './progressFile';

/** "45 s", "12 min", "1 h 05 min". */
export function formatDuration(seconds: number | null, t: Translate): string {
  if (seconds === null || !Number.isFinite(seconds)) return t('classroom:format.none');
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return t('classroom:format.seconds', { count: s });
  const totalMinutes = Math.round(s / 60);
  if (totalMinutes < 60) return t('classroom:format.minutes', { count: totalMinutes });
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return t('classroom:format.hoursMinutes', { hours: h, minutes: String(m).padStart(2, '0') });
}

/** "62%" from a 0-1 rate. */
export function formatPercent(rate: number | null, t: Translate): string {
  if (rate === null || !Number.isFinite(rate)) return t('classroom:format.none');
  return t('classroom:format.percent', { value: Math.round(rate * 100) });
}

/** One decimal, e.g. "2.4". */
export function formatDecimal(value: number | null, t: Translate): string {
  if (value === null || !Number.isFinite(value)) return t('classroom:format.none');
  return (Math.round(value * 10) / 10).toFixed(1);
}

/** Local date and time, e.g. "Sep 28, 2026, 2:05 PM". */
export function formatDateTime(iso: string | null, locale: string, t: Translate): string {
  if (!iso) return t('classroom:format.never');
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return t('classroom:format.never');
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(d);
  } catch {
    return d.toISOString().slice(0, 16).replace('T', ' ');
  }
}

/** YYYY-MM-DD of a date in local time (for file names). */
export function localDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
