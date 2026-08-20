import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { type ChildProfile } from "./profileModel";

export { PROFILE_THEMES } from "./profileModel";
// Die Levelbeschreibungen kommen aus den Levelplaenen, damit Titel, Kurzzeile
// und Inhalte nicht auseinanderlaufen.
export { LEVEL_PLANS, LEVEL_SUMMARIES } from "@/data/levels";
export type { ChildProfile, LearningGoal, LearningLevel, ProfileMode, ProfileStyle, ProfileTheme } from "./profileModel";

type ProfileState = {
  profile: ChildProfile | null;
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
  saveProfile: (profile: ChildProfile) => void;
  updateProfile: (changes: Partial<ChildProfile>) => void;
  clearProfile: () => void;
};

export const useProfile = create<ProfileState>()(
  persist(
    (set) => ({
      profile: null,
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),
      saveProfile: (profile) => set({ profile }),
      updateProfile: (changes) =>
        set((state) => ({
          profile: state.profile ? { ...state.profile, ...changes } : null,
        })),
      clearProfile: () => set({ profile: null }),
    }),
    {
      name: "kidsapp.profile.v1",
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
    },
  ),
);

