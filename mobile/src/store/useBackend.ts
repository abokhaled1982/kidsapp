import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

type BackendState = {
  /** Alter WS-Backend URL (fuer Fallback) */
  url: string;
  token: string;
  /** Modal Token-Endpoint URL fuer LiveKit */
  tokenEndpoint: string;
  /** Welcher Transport aktiv ist: "ws" (alt) oder "livekit" (neu) */
  transport: "ws" | "livekit";
  setUrl: (u: string) => void;
  setToken: (t: string) => void;
  setTokenEndpoint: (u: string) => void;
  setTransport: (t: "ws" | "livekit") => void;
};

export const useBackend = create<BackendState>()(
  persist(
    (set) => ({
      url: "",
      token: "",
      tokenEndpoint: "",
      transport: "ws",  // Default: alter Transport (Feature-Flag)
      setUrl: (u) => set({ url: u.trim().replace(/\/$/, "") }),
      setToken: (t) => set({ token: t.trim() }),
      setTokenEndpoint: (u) => set({ tokenEndpoint: u.trim().replace(/\/$/, "") }),
      setTransport: (t) => set({ transport: t }),
    }),
    { name: "kidsapp.backend.v2", storage: createJSONStorage(() => AsyncStorage) },
  ),
);

