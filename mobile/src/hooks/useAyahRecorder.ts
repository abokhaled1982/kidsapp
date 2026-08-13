import { useEffect, useRef, useState, useCallback } from "react";
import {
  useAudioRecorder,
  useAudioRecorderState,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
  AudioQuality,
  IOSOutputFormat,
  type RecordingOptions,
} from "expo-audio";

// Ayat sind laenger als Einzelwoerter -> deutlich groessere Fenster,
// aber wir stoppen trotzdem automatisch, sobald das Kind fertig ist.
const MAX_RECORD_MS   = 20000;
const MIN_TOTAL_MS    = 700;
const SILENCE_END_MS  = 700;   // geduldiger als Einzelwort-Modus: Kinder halten Tajweed-Pausen
const START_DB        = -35;
const SILENCE_DB      = -45;

// Identisch zum Wort-Recorder: 16 kHz mono, ASR-optimierter Encoder pro Plattform.
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

export type AyahRecorderStatus = "idle" | "recording" | "processing" | "done" | "error";

export function useAyahRecorder(onStop: (uri: string | null) => void) {
  const recorder = useAudioRecorder({
    ...ASR_RECORDING_OPTIONS,
    isMeteringEnabled: true,
  });
  const state = useAudioRecorderState(recorder, 100);

  const [status, setStatus] = useState<AyahRecorderStatus>("idle");
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
    if (status !== "recording") return;
    const db = state.metering ?? -60;
    const elapsed = Date.now() - startedAtRef.current;

    if (!speechStartedRef.current && db > START_DB && elapsed > 150) {
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
  }, [state.metering, status, stop]);

  return { status, start, stop, level: state.metering ?? -60 };
}
