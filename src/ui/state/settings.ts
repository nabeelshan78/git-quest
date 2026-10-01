/**
 * Player settings (theme, text size, motion, screen reader) persisted in
 * localStorage under SETTINGS_STORAGE_KEY. Themes: light and dark only
 * (docs/SCOPE.md), plus "system" which follows the computer.
 */
import { z } from 'zod';
import { create } from 'zustand';
import { SETTINGS_STORAGE_KEY } from '../../shared/progress';
import { safeStorage } from './storage';

export const THEMES = ['system', 'light', 'dark'] as const;
export type ThemeSetting = (typeof THEMES)[number];
export type ResolvedTheme = 'light' | 'dark';

export const ANIMATION_SPEEDS = ['slow', 'normal', 'fast'] as const;
export type AnimationSpeed = (typeof ANIMATION_SPEEDS)[number];

export const FONT_SCALES = [0.9, 1, 1.15, 1.3] as const;

const SettingsSchema = z.object({
  theme: z.enum(THEMES),
  fontScale: z.number().min(0.8).max(1.5),
  animationSpeed: z.enum(ANIMATION_SPEEDS),
  reducedMotion: z.boolean(),
  screenReader: z.boolean(),
});

export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  fontScale: 1,
  animationSpeed: 'normal',
  reducedMotion: false,
  screenReader: false,
};

/** Parse saved settings; unknown or invalid fields fall back to the defaults one by one. */
export function parseSettings(raw: string | null): Settings {
  if (!raw) return { ...DEFAULT_SETTINGS };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
  if (!data || typeof data !== 'object') return { ...DEFAULT_SETTINGS };
  const out: Settings = { ...DEFAULT_SETTINGS };
  const shape = SettingsSchema.shape;
  const obj = data as Record<string, unknown>;
  for (const key of Object.keys(shape) as (keyof Settings)[]) {
    const parsed = shape[key].safeParse(obj[key]);
    if (parsed.success) (out as Record<keyof Settings, unknown>)[key] = parsed.data;
  }
  return out;
}

interface SettingsStore {
  settings: Settings;
  update(patch: Partial<Settings>): void;
  reset(): void;
}

export const useSettingsStore = create<SettingsStore>()((set, get) => ({
  settings: parseSettings(safeStorage().getItem(SETTINGS_STORAGE_KEY)),
  update(patch) {
    const next = { ...get().settings, ...patch };
    safeStorage().setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
    set({ settings: next });
  },
  reset() {
    safeStorage().removeItem(SETTINGS_STORAGE_KEY);
    set({ settings: { ...DEFAULT_SETTINGS } });
  },
}));

export function useSettings(): Settings {
  return useSettingsStore((s) => s.settings);
}

export function resolveTheme(theme: ThemeSetting, prefersDark: boolean): ResolvedTheme {
  if (theme === 'system') return prefersDark ? 'dark' : 'light';
  return theme;
}

/** Duration multiplier for world-view animations. */
export function speedFactor(speed: AnimationSpeed): number {
  return speed === 'slow' ? 1.8 : speed === 'fast' ? 0.5 : 1;
}

function mediaMatches(query: string): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
  } catch {
    return false;
  }
}

export function prefersReducedMotion(): boolean {
  return mediaMatches('(prefers-reduced-motion: reduce)');
}

export function prefersDarkScheme(): boolean {
  return mediaMatches('(prefers-color-scheme: dark)');
}
