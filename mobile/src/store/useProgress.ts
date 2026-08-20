import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

type ProgressState = {
  xp: number;
  stars: number;
  streakDays: number;
  lastPlayedISO: string | null;
  wordsMastered: Record<string, number>;
  // Wie oft ein Hoerinhalt (Buchstabe, Haraka, Silbe, Tajweed-Regel) angehoert
  // wurde. Level 5 und 6 haben keine Aussprachebewertung, ihr Fortschritt
  // haengt an diesen Zaehlern.
  heard: Record<string, number>;
  addResult: (wordKey: string, total: number) => void;
  markHeard: (key: string) => void;
  reset: () => void;
};

const XP_PER_WORD = 10;

export const useProgress = create<ProgressState>()(
  persist(
    (set, get) => ({
      xp: 0,
      stars: 0,
      streakDays: 0,
      lastPlayedISO: null,
      wordsMastered: {},
      heard: {},

      addResult: (wordKey, total) => {
        const gainedStars = total >= 90 ? 3 : total >= 75 ? 2 : total >= 50 ? 1 : 0;
        const gainedXP = Math.round((total / 100) * XP_PER_WORD);
        const today = new Date().toISOString().slice(0, 10);
        const last = get().lastPlayedISO?.slice(0, 10);
        const streak = last === today
          ? get().streakDays
          : (last && new Date(today).getTime() - new Date(last).getTime() === 86400000
              ? get().streakDays + 1
              : 1);
        set((s) => ({
          xp: s.xp + gainedXP,
          stars: s.stars + gainedStars,
          streakDays: streak,
          lastPlayedISO: new Date().toISOString(),
          wordsMastered: {
            ...s.wordsMastered,
            [wordKey]: Math.max(s.wordsMastered[wordKey] ?? 0, total),
          },
        }));
      },

      markHeard: (key) =>
        set((s) => ({
          heard: { ...s.heard, [key]: (s.heard[key] ?? 0) + 1 },
        })),

      reset: () =>
        set({ xp: 0, stars: 0, streakDays: 0, lastPlayedISO: null, wordsMastered: {}, heard: {} }),
    }),
    {
      name: "kidsapp.progress.v1",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

export function level(xp: number): number {
  return Math.floor(Math.sqrt(xp / 25)) + 1;
}

export function xpForNextLevel(xp: number): number {
  const curr = level(xp);
  return Math.pow(curr, 2) * 25;
}
