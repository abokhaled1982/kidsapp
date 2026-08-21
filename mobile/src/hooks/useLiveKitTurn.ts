// Eine Uebungsrunde ("Turn") gegen den LiveKit-Agenten fahren.
//
// Ersetzt useAutoRecorder + useAyahRecorder: aufgenommen wird nichts mehr
// lokal, das Mikrofon streamt direkt in den Room und der Agent entscheidet
// serverseitig per VAD, wann das Kind fertig gesprochen hat.
//
// Der Hook besitzt den Status der Runde; die Screens malen daraus ihre Phase.
// Die Reihenfolge Zielwort -> Vorspann (TTS/Lesezeit) -> Mikrofon steckt in
// livekit-stream.ts, weil das Mikrofon waehrend der TTS zu bleiben muss.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTrackVolume } from "@livekit/react-native";
import type { LocalAudioTrack } from "livekit-client";

import {
  getLiveKitSession,
  TurnCancelled,
  type AyahDoneEvent,
  type AyahProgress,
  type ScoreResult,
  type TurnTimings,
} from "@/lib/livekit-stream";
import { speakArabic, stopSpeaking } from "@/lib/tts";
import { useBackend } from "@/store/useBackend";

/**
 * "reading" = Lesezeit, bevor das Mikrofon aufgeht (ab Level 7).
 * "done" = Runde beendet; das Ergebnis (oder der Fehler) liegt beim Aufrufer.
 * Ohne "done" waere zwischen "scoring" und dem gerenderten Ergebnis ein
 * Frame lang "idle" - und damit ein Flackern.
 */
export type TurnStatus =
  | "idle"
  | "connecting"
  | "tts"
  | "reading"
  | "listening"
  | "scoring"
  | "done";

/** Was passiert, nachdem der Agent bereit ist und bevor das Mikrofon aufgeht. */
export type Prelude =
  | { kind: "speak"; text: string }  // vorsprechen (Level 5/6)
  | { kind: "wait"; ms: number }     // Lesezeit / kurzes Durchatmen
  | null;

/** Falls expo-speech keinen Callback liefert, darf die Runde nicht haengen. */
const TTS_GUARD_MS = 10000;

export function useLiveKitTurn() {
  const tokenEndpoint = useBackend((s) => s.tokenEndpoint);
  const identity = useBackend((s) => s.identity);

  const config = useMemo(() => ({ tokenEndpoint, identity }), [tokenEndpoint, identity]);
  const session = useMemo(
    () => (tokenEndpoint ? getLiveKitSession(config) : null),
    [config, tokenEndpoint],
  );

  const [status, setStatus] = useState<TurnStatus>("idle");
  const [track, setTrack] = useState<LocalAudioTrack | null>(null);
  // 0..1 direkt aus dem SDK - ersetzt das dB-Metering der alten Recorder.
  const level = useTrackVolume(track ?? undefined);

  const waitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!session) {
      setTrack(null);
      return;
    }
    setTrack(session.getAudioTrack());
    return session.onAudioTrack(setTrack);
  }, [session]);

  const clearWait = () => {
    if (waitTimer.current) clearTimeout(waitTimer.current);
    waitTimer.current = null;
  };

  useEffect(() => clearWait, []);

  const runPrelude = useCallback((prelude: Prelude) => {
    if (!prelude) return Promise.resolve();
    if (prelude.kind === "wait") {
      setStatus("reading");
      return new Promise<void>((resolve) => {
        clearWait();
        waitTimer.current = setTimeout(resolve, prelude.ms);
      });
    }
    setStatus("tts");
    return new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearWait();
        resolve();
      };
      clearWait();
      waitTimer.current = setTimeout(finish, TTS_GUARD_MS);
      speakArabic(prelude.text, finish);
    });
  }, []);

  /** Runde abbrechen. Bricht auch eine laufende TTS ab, sonst blockiert sie. */
  const cancel = useCallback(() => {
    clearWait();
    stopSpeaking();
    session?.cancel();
    setStatus("idle");
  }, [session]);

  const warmUp = useCallback(() => {
    session?.warmUp();
  }, [session]);

  /** "Fertig"-Knopf: den Agenten sofort bewerten lassen. */
  const flush = useCallback(() => {
    session?.flush().catch(() => {});
  }, [session]);

  const beforeListen = useCallback(
    (prelude: Prelude) => async () => {
      await runPrelude(prelude);
      setStatus("listening");
    },
    [runPrelude],
  );

  const runWord = useCallback(
    async (
      target: string,
      prelude: Prelude = null,
    ): Promise<{ result: ScoreResult; timings: TurnTimings }> => {
      if (!session) throw new Error("Kein Backend eingerichtet.");
      setStatus("connecting");
      try {
        const out = await session.assessWord(target, {
          beforeListen: beforeListen(prelude),
          onScoring: () => setStatus("scoring"),
        });
        setStatus("done");
        return out;
      } catch (e) {
        setStatus(isCancelled(e) ? "idle" : "done");
        throw e;
      } finally {
        clearWait();
      }
    },
    [session, beforeListen],
  );

  const runAyah = useCallback(
    async (
      ayahText: string,
      onProgress: (ev: AyahProgress) => void,
      prelude: Prelude = null,
    ): Promise<{ done: AyahDoneEvent; timings: TurnTimings }> => {
      if (!session) throw new Error("Kein Backend eingerichtet.");
      setStatus("connecting");
      try {
        const out = await session.assessAyah(ayahText, onProgress, {
          beforeListen: beforeListen(prelude),
          onScoring: () => setStatus("scoring"),
        });
        setStatus("done");
        return out;
      } catch (e) {
        setStatus(isCancelled(e) ? "idle" : "done");
        throw e;
      } finally {
        clearWait();
      }
    },
    [session, beforeListen],
  );

  return {
    status,
    /** Mikrofonpegel 0..1, nur waehrend "listening" aussagekraeftig. */
    level,
    /** Ohne Token-Endpoint gibt es keinen Transport. */
    configured: Boolean(tokenEndpoint),
    runWord,
    runAyah,
    flush,
    cancel,
    warmUp,
  };
}

/** Abbrueche sind kein Fehler fuer das Kind - Screens filtern sie damit weg. */
export function isCancelled(e: unknown): boolean {
  return e instanceof TurnCancelled;
}
