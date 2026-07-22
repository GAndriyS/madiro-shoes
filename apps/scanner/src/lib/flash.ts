import { create } from 'zustand';

export interface Flash {
  title: string;
  subtitle: string;
}

interface FlashState {
  flash: Flash | null;
  show: (flash: Flash) => void;
  clear: () => void;
}

/**
 * One-shot success toast that survives a navigation: the sale flow registers a
 * checkout and returns to the home hub, which renders the toast (design 2a-3).
 */
export const useFlashStore = create<FlashState>((set) => ({
  flash: null,
  show: (flash) => set({ flash }),
  clear: () => set({ flash: null }),
}));
