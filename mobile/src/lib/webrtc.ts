// Einziger Zugriffspunkt auf @livekit/react-native.
//
// Das Paket wirft schon beim Laden ("WebRTC native module not found"), wenn das
// native WebRTC-Modul fehlt: in Expo Go immer, und in einem Dev-Client, der vor
// dem Hinzufuegen von @config-plugins/react-native-webrtc gebaut wurde, ebenso.
//
// Ein try/catch an einer einzelnen Import-Stelle reicht dagegen nicht: Metro
// merkt sich einen Modulfehler und wirft ihn bei jedem weiteren require erneut -
// mit dem Stack des ersten Versuchs. Jeder unbewachte Import irgendwo im
// Routen-Baum knallt also weiter, und expo-router laedt die Routen beim Start.
// Genau deshalb liegt hier der einzige require; alle anderen Module holen sich
// LiveKit ueber dieses Modul.

type LiveKitNative = typeof import("@livekit/react-native");

let native: LiveKitNative | null = null;

try {
  native = require("@livekit/react-native") as LiveKitNative;
  // Muss laufen, bevor irgendein livekit-client-Code die WebRTC-Globals
  // anfasst - deshalb im Modul-Scope und nicht in einem Effect. Auf iOS
  // konfiguriert das auch die AVAudioSession; die Android-Audio-Session macht
  // livekit-stream.ts beim Verbinden auf.
  native.registerGlobals();
} catch (e) {
  native = null;
  console.warn(
    "[LiveKit] Kein natives WebRTC-Modul - Sprachbewertung deaktiviert. " +
      "Sie braucht einen Dev-Client-Build; Expo Go kann das nicht.",
    e,
  );
}

/** false = kein natives WebRTC (Expo Go oder Dev-Client ohne WebRTC-Plugin). */
export const webrtcAvailable = native !== null;

export const WEBRTC_MISSING_MESSAGE =
  "Sprachaufnahme nicht verfügbar: Diese App braucht einen Dev-Client-Build. " +
  "In Expo Go fehlt das native WebRTC-Modul.";

/**
 * LiveKit holen oder mit klarer Meldung abbrechen - der Modulfehler des Pakets
 * ("Try executing npm install") schickt einen sonst in die falsche Richtung.
 */
export function requireLiveKit(): LiveKitNative {
  if (!native) throw new Error(WEBRTC_MISSING_MESSAGE);
  return native;
}

/**
 * Ohne natives WebRTC gibt es keinen Track und damit keinen Pegel. Die
 * Funktions-Identitaet ist modulweit stabil, damit die Hook-Reihenfolge im
 * Aufrufer ueber alle Renders gleich bleibt.
 */
export const useTrackVolume: LiveKitNative["useTrackVolume"] =
  native?.useTrackVolume ?? (() => 0);
