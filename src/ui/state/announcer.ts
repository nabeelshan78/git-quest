/**
 * A single polite live region for screen readers (goal ticks, Ada's lines,
 * errors, win). `announce` replaces the message; repeated text is re-read.
 */
import { create } from 'zustand';

interface AnnouncerState {
  message: string;
  seq: number;
  announce(text: string): void;
}

export const useAnnouncer = create<AnnouncerState>()((set, get) => ({
  message: '',
  seq: 0,
  announce(text) {
    if (!text) return;
    set({ message: text, seq: get().seq + 1 });
  },
}));

export function announce(text: string): void {
  useAnnouncer.getState().announce(text);
}
