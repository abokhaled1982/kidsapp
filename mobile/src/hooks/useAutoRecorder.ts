import { useEffect, useRef, useState, useCallback } from "react";
import {
  useAudioRecorder,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
  AudioQuality,
  IOSOutputFormat,
  type RecordingOptions,
} from "expo-audio";

const MAX_RECORD_MS   = 3500;
const MIN_TOTAL_MS    = 500;
const SILENCE_END_MS  = 220; // war 380 - VAD im Backend faengt Rest ab, Client kann strenger sein
const START_DB        = -35; // > als das gilt es als Sprache begonnen
const SILENCE_DB      = -45; // < als das gilt es als Stille

// ASR-optimierte Aufnahme:
//  - 16 kHz mono = native wav2vec2-Rate: kein Resampling, halb so grosse Upload-Payload wie 44.1 kHz.
//  - Android audioSource "voice_recognition": aktiviert Googles fuer ASR getunte NS/AGC-Kette
//    (identisch zu Google Assistant / Speech-to-Text), ohne aggressive Echo-Cancellation, die
//    arabische Gutturale (\u062d\u062e\u0639\u063a\u0642) verstuemmelt.
//  - iOS LINEARPCM: verlustfreies WAV statt AAC \u2192 keine Codec-Artefakte auf Frikativen (\u062b/\u0633/\u0641).
const ASR_RECORDING_OPTIONS: RecordingOptions = {
  extension: ".m4a",
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 128000,
  android: {
    extension: ".m4a",
    outputFormat: "mpeg4",
    audioEncoder: "aac",
    audioSource: "voice_recognition",
    sampleRate: 16000,
  },
  ios: {
    extension: ".wav",
    outputFormat: IOSOutputFormat.LINEARPCM,
    audioQuality: AudioQuality.MAX,
    sampleRate: 16000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: "audio/webm;codecs=opus",
    bitsPerSecond: 128000,
  },
};

export type RecorderStatus = "idle" | "recording" | "processing" | "done" | "error";

/**
 * Auto-Aufnahme mit Endpunktdetektion per Lautstärke-Metering.
 * onStop erhält die lokale URI der finalen m4a-Datei (oder null bei Fehler).
 */
export function useAutoRecorder(onStop: (uri: string | null) => void) {
  const mountedRef = useRef(true);
  const [metering, setMetering] = useState<number | undefined>(undefined);
  const recorder = useAudioRecorder({ ...ASR_RECORDING_OPTIONS, isMeteringEnabled: true });

  const [status, setStatus] = useState<RecorderStatus>("idle");
  const startedAtRef = useRef<number>(0);
  const speechStartedRef = useRef<boolean>(false);
  const silenceStartRef = useRef<number | null>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = useRef<boolean>(false);

  const cleanup = () => {
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    stopTimerRef.current = null;
    speechStartedRef.current = false;
    silenceStartRef.current = null;
    stoppedRef.current = false;
  };

  const stop = useCallback(async () => {
    if (stoppedRef.current) return;
    stoppedRef.current = true;
    setStatus("processing");
    try {
      await recorder.stop();
      onStop(recorder.uri ?? null);
      setStatus("done");
    } catch {
      onStop(null);
      setStatus("error");
    } finally {
      cleanup();
    }
  }, [recorder, onStop]);

  const start = useCallback(async () => {
    cleanup();
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) { setStatus("error"); onStop(null); return; }
    // doNotMix: exklusiver Mic-Zugriff, verhindert das ein anderer Prozess das Signal daempft.
    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
      interruptionMode: "doNotMix",
      shouldRouteThroughEarpiece: false,
    });
    await recorder.prepareToRecordAsync();
    recorder.record();
    startedAtRef.current = Date.now();
    setStatus("recording");
    stopTimerRef.current = setTimeout(() => { stop(); }, MAX_RECORD_MS);
  }, [recorder, onStop, stop]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (status !== "recording") return;
    const timer = setInterval(() => {
      if (!mountedRef.current) return;
      try {
        setMetering(recorder.getStatus().metering);
      } catch {
        clearInterval(timer);
      }
    }, 100);
    return () => clearInterval(timer);
  }, [recorder, status]);

  useEffect(() => {
    if (status !== "recording" || !mountedRef.current) return;
    const db = metering ?? -60;
    const elapsed = Date.now() - startedAtRef.current;

    if (!speechStartedRef.current && db > START_DB && elapsed > 100) {
      speechStartedRef.current = true;
    }
    if (speechStartedRef.current) {
      if (db < SILENCE_DB) {
        if (silenceStartRef.current == null) silenceStartRef.current = Date.now();
        if (
          Date.now() - silenceStartRef.current >= SILENCE_END_MS &&
          elapsed >= MIN_TOTAL_MS
        ) {
          stop();
        }
      } else {
        silenceStartRef.current = null;
      }
    }
  }, [metering, status, stop]);

  return { status, start, stop, level: metering ?? -60 };
}
