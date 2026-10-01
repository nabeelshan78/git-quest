/**
 * Simple generated avatar for story characters: a coloured lantern-shaped
 * badge with initials. The speaker's name is always shown next to it.
 */
import characters from '../../../content/dialogue/characters.json';

interface CharacterInfo {
  id: string;
  name: string;
  role: string;
  color: string;
}

const BY_ID = new Map<string, CharacterInfo>((characters.characters as CharacterInfo[]).map((c) => [c.id, c]));

export function characterInfo(speaker: string): CharacterInfo {
  return BY_ID.get(speaker) ?? { id: speaker, name: speaker, role: '', color: '#56B4E9' };
}

export function allCharacters(): CharacterInfo[] {
  return [...BY_ID.values()];
}

function initials(speaker: string): string {
  if (speaker === 'You') return 'You';
  return speaker.slice(0, 1).toUpperCase();
}

/** Relative luminance (WCAG) of a #rrggbb colour. */
export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0.5;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** Black or white text, whichever contrasts more with the background. */
export function textOn(hex: string): string {
  const l = luminance(hex);
  return (l + 0.05) / 0.05 > 1.05 / (l + 0.05) ? '#111111' : '#ffffff';
}

export function Avatar({ speaker, size = 36, mood }: { speaker: string; size?: number; mood?: string }) {
  const info = characterInfo(speaker);
  const label = initials(speaker);
  const fg = textOn(info.color);
  return (
    <svg className="gq-avatar" width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" focusable="false" data-mood={mood ?? 'neutral'}>
      <rect x="15" y="1" width="10" height="5" rx="2" fill="currentColor" opacity="0.55" />
      <rect x="3" y="5" width="34" height="32" rx="14" fill={info.color} />
      <rect x="3" y="5" width="34" height="32" rx="14" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" />
      <text x="20" y="26" textAnchor="middle" fontSize={label.length > 1 ? 11 : 16} fontWeight="700" fill={fg} fontFamily="system-ui, sans-serif">
        {label}
      </text>
    </svg>
  );
}
