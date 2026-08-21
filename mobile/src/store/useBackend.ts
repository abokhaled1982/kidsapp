import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

/** Zufaellige, stabile Geraete-Identity. Bestimmt den LiveKit-Room, damit
 *  nicht alle Kinder im selben Room landen. Kein Personenbezug. */
function newIdentity(): string {
  return `kid-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Deployter Modal-Endpoint. Als Default hinterlegt, damit eine frische
 *  Installation ohne Handarbeit laeuft; in den Einstellungen ueberschreibbar
 *  (der persistierte Wert gewinnt danach). */
const DEFAULT_TOKEN_ENDPOINT =
  "https://alghobariwaled--quran-asr-livekit-get-token.modal.run";

type BackendState = {
  /** Modal Token-Endpoint (POST -> {token, url, room}). Einzige Backend-Adresse,
   *  die die App kennt - LiveKit-URL kommt aus der Antwort. */
  tokenEndpoint: string;
  /** Einmalig erzeugt, danach persistent: Identity + Room-Zuordnung. */
  identity: string;
  setTokenEndpoint: (u: string) => void;
};

export const useBackend = create<BackendState>()(
  persist(
    (set) => ({
      tokenEndpoint: DEFAULT_TOKEN_ENDPOINT,
      identity: newIdentity(),
      setTokenEndpoint: (u) => set({ tokenEndpoint: u.trim().replace(/\/$/, "") }),
    }),
    // v3: die WS-Felder (url/token/transport) sind weg. Neuer Key, damit alte
    // Installationen nicht mit einer toten Backend-URL starten.
    { name: "kidsapp.backend.v3", storage: createJSONStorage(() => AsyncStorage) },
  ),
);
