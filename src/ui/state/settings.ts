/**
 * Player settings (theme, terminal theme, text size, motion, screen reader)
 * persisted in localStorage under SETTINGS_STORAGE_KEY.
 */
import { z } from 'zod';
import { create } from 'zustand';
import { SETTINGS_STORAGE_KEY } from '../../shared/progress';
import { safeStorage } from './storage';

export const THEMES = ['system', 'light', 'dark', 'high-contrast'] as const;
export type ThemeSetting = (typeof THEMES)[number];
export type ResolvedTheme = 'light' | 'dark' | 'high-contrast';

export const ANIMATION_SPEEDS = ['slow', 'normal', 'fast'] as const;
export type AnimationSpeed = (typeof ANIMATION_SPEEDS)[number];

export const FONT_SCALES = [0.9, 1, 1.15, 1.3] as const;

export const LANGUAGES = ['en'] as const;

const SettingsSchema = z.object({
  theme: z.enum(THEMES),
  terminalTheme: z.string(),
  fontScale: z.number().min(0.8).max(1.5),
  animationSpeed: z.enum(ANIMATION_SPEEDS),
  reducedMotion: z.boolean(),
  screenReader: z.boolean(),
  language: z.string(),
});

export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  terminalTheme: 'lantern',
  fontScale: 1,
  animationSpeed: 'normal',
  reducedMotion: false,
  screenReader: false,
  language: 'en',
};

export function parseSettings(raw: string | null): Settings {
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = SettingsSchema.partial().safeParse(JSON.parse(raw));
    if (!parsed.success) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...parsed.data };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
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

export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function prefersDarkScheme(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}
