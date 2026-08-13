import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

type BackendState = {
  url: string;
  streaming: boolean;
  setUrl: (u: string) => void;
  setStreaming: (s: boolean) => void;
};

export const useBackend = create<BackendState>()(
  persist(
    (set) => ({
      url: "",
      streaming: true,
      setUrl: (u) => set({ url: u.trim().replace(/\/$/, "") }),
      setStreaming: (s) => set({ streaming: s }),
    }),
    { name: "kidsapp.backend.v1", storage: createJSONStorage(() => AsyncStorage) },
  ),
);
