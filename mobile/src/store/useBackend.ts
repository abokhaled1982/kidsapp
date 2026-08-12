import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

type BackendState = {
  url: string;
  setUrl: (u: string) => void;
};

export const useBackend = create<BackendState>()(
  persist(
    (set) => ({
      url: "",
      setUrl: (u) => set({ url: u.trim().replace(/\/$/, "") }),
    }),
    { name: "kidsapp.backend.v1", storage: createJSONStorage(() => AsyncStorage) },
  ),
);
