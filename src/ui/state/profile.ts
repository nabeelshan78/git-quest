/**
 * Player profile helpers (pure).
 */

export const DEFAULT_HANDLE = 'intern';
export const DEFAULT_DISPLAY_NAME = 'Intern';
export const EMAIL_DOMAIN = 'lanternlabs.example';

/**
 * Derive the simulated GitHub handle from a display name: lower-case
 * letters, digits and hyphens, starting with a letter or digit, at most 39
 * characters. Falls back to "intern".
 */
export function deriveHandle(name: string): string {
  const ascii = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  const slug = ascii
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 39)
    .replace(/-+$/g, '');
  return /^[a-z0-9][a-z0-9-]{0,38}$/.test(slug) ? slug : DEFAULT_HANDLE;
}

export function emailForHandle(handle: string): string {
  return `${handle}@${EMAIL_DOMAIN}`;
}

/** Profile patch saved by the first-launch dialog and the settings page. */
export function profileFromForm(name: string, classCode: string): { name: string; handle: string; email: string; classCode: string } {
  const trimmed = name.trim().replace(/\s+/g, ' ').slice(0, 60);
  const displayName = trimmed || DEFAULT_DISPLAY_NAME;
  const handle = deriveHandle(trimmed);
  return { name: displayName, handle, email: emailForHandle(handle), classCode: classCode.trim().slice(0, 40) };
}
