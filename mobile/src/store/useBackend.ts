import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

type BackendState = {
  url: string;
  token: string;
  setUrl: (u: string) => void;
  setToken: (t: string) => void;
};

export const useBackend = create<BackendState>()(
  persist(
    (set) => ({
      url: "",
      token: "",
      setUrl: (u) => set({ url: u.trim().replace(/\/$/, "") }),
      setToken: (t) => set({ token: t.trim() }),
    }),
    { name: "kidsapp.backend.v1", storage: createJSONStorage(() => AsyncStorage) },
  ),
);
