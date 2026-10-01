/**
 * Motion preferences for every animated part of the UI: off in test mode
 * (?test=1) and with reduced motion (setting or operating system), slower or
 * faster with the animation-speed setting.
 */
import { createContext, useContext } from 'react';
import type { Transition } from 'motion/react';

export interface MotionPrefs {
  /** False = everything jumps to its end state at once. */
  animate: boolean;
  /** Duration multiplier (slow 1.8, normal 1, fast 0.5). */
  factor: number;
}

export const DEFAULT_MOTION: MotionPrefs = { animate: true, factor: 1 };

export const MotionPrefsContext = createContext<MotionPrefs>(DEFAULT_MOTION);

export function useMotionPrefs(): MotionPrefs {
  return useContext(MotionPrefsContext);
}

export function motionPrefsFrom(options: { testMode: boolean; reducedMotionSetting: boolean; systemReducedMotion: boolean; factor: number }): MotionPrefs {
  const animate = !options.testMode && !options.reducedMotionSetting && !options.systemReducedMotion;
  return { animate, factor: options.factor };
}

/** The spring used for sliding graph labels and commits (instant when motion is off). */
export function springFor(prefs: MotionPrefs): Transition {
  if (!prefs.animate) return { duration: 0 };
  return { type: 'spring', stiffness: 260 / prefs.factor, damping: 28 };
}
