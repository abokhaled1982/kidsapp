import { useEffect, useRef, useState, useCallback } from "react";
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
} from "expo-audio";

const MAX_RECORD_MS   = 3500;
const MIN_TOTAL_MS    = 600;
const SILENCE_END_MS  = 380;
const START_DB        = -35; // > als das gilt es als Sprache begonnen
const SILENCE_DB      = -45; // < als das gilt es als Stille

export type RecorderStatus = "idle" | "recording" | "processing" | "done" | "error";

/**
 * Auto-Aufnahme mit Endpunktdetektion per Lautstärke-Metering.
 * onStop erhält die lokale URI der finalen m4a-Datei (oder null bei Fehler).
 */
export function useAutoRecorder(onStop: (uri: string | null) => void) {
  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  });
  const state = useAudioRecorderState(recorder, 100);

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
    } catch (e) {
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
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
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
  }, [state.metering, status, stop]);

  return { status, start, stop, level: state.metering ?? -60 };
}
