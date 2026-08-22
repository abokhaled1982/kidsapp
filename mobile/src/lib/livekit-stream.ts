// LiveKit-Session zum Backend. Einziger Transport der App.
//
// Ablauf einer Runde ("Turn"):
//   1. Room verbinden (Token vom Modal-Endpoint), Audio-Track stumm publizieren
//   2. Warten, bis der Agent im Room ist
//   3. Zielwort/Ayah per DataChannel senden -> Agent antwortet mit {"kind":"ready"}
//   4. beforeListen() laufen lassen (TTS spricht vor - Mikrofon ist dabei ZU)
//   5. Mikrofon auf, Kind spricht, der Agent endpointet per VAD
//   6. Ergebnis-Frames kommen per DataChannel, Mikrofon wieder zu
//
// Warum das Mikrofon zwischen den Schritten stumm bleibt: der Track ist
// dauerhaft publiziert (spart den Publish-Roundtrip pro Wort), und die
// Echo-Cancellation ist aus - ohne Mute wuerde die TTS-Ausgabe ins Mikrofon
// laufen und der Agent wuerde sich selbst bewerten.
//
// Voraussetzungen: EAS Dev-Client Build (kein Expo Go), registerGlobals() im
// Root-Layout.

// Zuerst: setzt die WebRTC-Globals, die livekit-client erwartet.
import { requireLiveKit } from "@/lib/webrtc";

import {
  Room,
  RoomEvent,
  ConnectionState,
  createLocalAudioTrack,
  type LocalAudioTrack,
} from "livekit-client";
import { useDebug } from "@/store/useDebug";
import type { AssessResponse, AssessUnit, ServerWordTimings } from "@/lib/api";

const TOKEN_TIMEOUT_MS = 8000;
const AGENT_WAIT_MS = 12000; // Modal-Container darf kalt starten
const READY_TIMEOUT_MS = 6000;
const WORD_TIMEOUT_MS = 15000;
const AYAH_TIMEOUT_MS = 30000;

// ---------------------------------------------------------------------------
// Frame-Typen (spiegeln backend/livekit_agent.py)
// ---------------------------------------------------------------------------

export type ScoreResult = AssessResponse & {
  duration_ms: number;
  timings?: ServerWordTimings;
};

export type AyahStartEvent = {
  kind: "start";
  words_count: number;
  transcription: string;
};
export type AyahWordEvent = {
  kind: "word";
  word_idx: number;
  target: string;
  score: number;
  units: AssessUnit[];
};
export type AyahDoneEvent = {
  kind: "done";
  total: number;
  words_count: number;
  duration_ms: number;
  timings?: {
    audio_samples?: number;
    audio_ms?: number;
    preprocess_ms?: number;
    asr_ms?: number;
    align_ms?: number;
    score_ms?: number;
  };
};
export type AyahProgress = AyahStartEvent | AyahWordEvent | AyahDoneEvent;

/** Client-seitige Latenz-Aufschluesselung fuer die Eltern-Diagnose. */
export type TurnTimings = {
  /** Room-Connect. 0, wenn die Session schon warm war. */
  connect_ms: number;
  /** Zielwort raus -> "ready" vom Agent. Enthaelt den Kaltstart des Containers. */
  ready_ms: number;
  /** Mikrofon auf -> VAD-Ende. Ueberwiegend die Sprechzeit des Kindes. */
  listen_ms: number;
  /** VAD-Ende -> erstes Ergebnis-Frame. Das ist die gefuehlte Wartezeit. */
  score_ms: number;
  /** Erstes -> letztes Frame. Nur im Ayah-Modus > 0. */
  stream_ms: number;
  total_ms: number;
  warm: boolean;
};

export type LiveKitConfig = {
  /** Modal Token-Endpoint (POST -> {token, url, room}). */
  tokenEndpoint: string;
  /** Geraete-Identity; bestimmt serverseitig den Room. */
  identity: string;
};

type TurnOptions = {
  /** Laeuft nach dem "ready" und VOR dem Oeffnen des Mikrofons (z.B. TTS). */
  beforeListen?: () => Promise<void>;
  /** Der Agent hat das Sprachende erkannt und rechnet. Fuer die UI. */
  onScoring?: () => void;
};

/**
 * Der Turn wurde von der App abgebrochen (Screen verlassen, "Nochmal"
 * gedrueckt). Eigene Klasse, damit die Screens den Abbruch verschlucken
 * koennen, statt dem Kind einen Fehler anzuzeigen.
 */
export class TurnCancelled extends Error {
  constructor() {
    super("Runde abgebrochen.");
    this.name = "TurnCancelled";
  }
}

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------

const encode = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));

/** Rennt `p` gegen eine Uhr und raeumt den Timer in beiden Faellen weg. */
function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(msg)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function fetchLiveKitToken(config: LiveKitConfig): Promise<{
  token: string;
  url: string;
  room: string;
}> {
  if (!config.tokenEndpoint) throw new Error("Kein Token-Endpoint gesetzt.");
  const res = await withTimeout(
    fetch(config.tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identity: config.identity }),
    }),
    TOKEN_TIMEOUT_MS,
    "Token-Endpoint antwortet nicht.",
  );
  if (!res.ok) throw new Error(`Token-Endpoint: ${res.status}`);
  const data = await res.json();
  if (!data?.token || !data?.url) throw new Error("Token-Endpoint lieferte kein Token.");
  return data;
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

class LiveKitSession {
  private room: Room | null = null;
  private audioTrack: LocalAudioTrack | null = null;
  private connecting: Promise<Room> | null = null;
  private audioSessionStarted = false;
  /** Der aktive Turn haengt hier seinen Frame-Empfaenger ein. */
  private frameHandler: ((frame: any) => void) | null = null;
  /** Abbruch des aktiven Turns, z.B. wenn der Room wegbricht. */
  private abortTurn: ((e: Error) => void) | null = null;
  /** Serialisiert Turns, damit sich Wort- und Ayah-Anfragen nicht ueberlappen. */
  private queue: Promise<any> = Promise.resolve();
  /** UI-Abonnenten des Mikrofon-Tracks (fuer useTrackVolume). */
  private trackListeners = new Set<(t: LocalAudioTrack | null) => void>();

  constructor(private config: LiveKitConfig) {}

  /** Fuer useTrackVolume: meldet den Mikrofon-Track, sobald er existiert. */
  onAudioTrack(cb: (t: LocalAudioTrack | null) => void): () => void {
    this.trackListeners.add(cb);
    return () => this.trackListeners.delete(cb);
  }

  private setAudioTrack(t: LocalAudioTrack | null): void {
    this.audioTrack = t;
    this.trackListeners.forEach((cb) => cb(t));
  }

  // --- Verbindung ---------------------------------------------------------

  isConnected(): boolean {
    return this.room?.state === ConnectionState.Connected;
  }

  /** Fire-and-forget beim Screen-Mount: die erste Runde zahlt keinen Connect. */
  warmUp(): void {
    this.connect().catch(() => {
      /* still - der erste echte Turn meldet den Fehler */
    });
  }

  /**
   * Verbinden und melden, ob der Agent im Room ist. Wirft, wenn schon der
   * Token oder der Room-Connect scheitert - das sind andere Fehlerklassen als
   * "verbunden, aber kein Agent" und der Settings-Screen zeigt sie getrennt.
   */
  async probe(): Promise<boolean> {
    const room = await this.connect();
    try {
      await this.waitForAgent(room);
      return true;
    } catch {
      return false;
    }
  }

  /** Fuer useTrackVolume in der UI. Null, solange nicht verbunden. */
  getAudioTrack(): LocalAudioTrack | null {
    return this.audioTrack;
  }

  private connect(): Promise<Room> {
    if (this.room && this.isConnected()) return Promise.resolve(this.room);
    if (this.connecting) return this.connecting;

    this.connecting = (async () => {
      // Vor dem Token-Request pruefen: fehlt das native Modul, soll die
      // Meldung nicht erst nach einem Netzwerk-Roundtrip kommen.
      const { AudioSession, AndroidAudioTypePresets } = requireLiveKit();

      const { token, url, room: roomName } = await fetchLiveKitToken(this.config);

      // Android-Audio-Session: "media" statt "communication", damit die
      // TTS-Ausgabe auf normaler Medienlautstaerke bleibt.
      await AudioSession.configureAudio({
        android: { audioTypeOptions: AndroidAudioTypePresets.media },
      });
      await AudioSession.startAudioSession();
      this.audioSessionStarted = true;

      const room = new Room();
      room.on(RoomEvent.DataReceived, (payload: Uint8Array) => {
        let frame: any;
        try {
          frame = JSON.parse(new TextDecoder().decode(payload));
        } catch (e) {
          useDebug.getState().push("lk_error", `DataChannel-Parsefehler: ${e}`);
          return;
        }
        this.frameHandler?.(frame);
      });
      room.on(RoomEvent.Reconnecting, () =>
        useDebug.getState().push("lk_reconnect", "Verbindung wackelt - reconnect…"),
      );
      room.on(RoomEvent.Reconnected, () =>
        useDebug.getState().push("lk_connect", "Wieder verbunden"),
      );
      room.on(RoomEvent.Disconnected, () => {
        useDebug.getState().push("lk_close", "Verbindung getrennt");
        this.room = null;
        this.setAudioTrack(null);
        this.connecting = null;
        // Eine laufende Runde bekommt sonst nie eine Antwort und haengt bis
        // zum Timeout - das Kind sieht 15 s lang einen offenen Mikrofonkreis.
        this.abortTurn?.(new Error("Verbindung unterbrochen."));
      });

      await room.connect(url, token);

      // Reihenfolge: erst stumm schalten, dann publizieren. Andersherum ginge
      // zwischen Publish und Mute Audio raus, das niemand angefordert hat.
      const track = await createLocalAudioTrack({
        echoCancellation: false, // wuerde arabische Gutturale verstuemmeln
        noiseSuppression: true,
        autoGainControl: true,
      });
      await track.mute();
      await room.localParticipant.publishTrack(track);

      this.room = room;
      this.setAudioTrack(track);
      useDebug.getState().push("lk_connect", `Room ${roomName} verbunden`);
      return room;
    })();

    return this.connecting.finally(() => {
      this.connecting = null;
    });
  }

  /** Der Agent joint den Room asynchron. Vorher gesendete Targets gehen verloren. */
  private async waitForAgent(room: Room): Promise<void> {
    if (room.remoteParticipants.size > 0) return;
    await withTimeout(
      new Promise<void>((resolve) => {
        const onJoin = () => {
          room.off(RoomEvent.ParticipantConnected, onJoin);
          resolve();
        };
        room.on(RoomEvent.ParticipantConnected, onJoin);
      }),
      AGENT_WAIT_MS,
      "Der Sprach-Agent ist nicht im Raum. Läuft das Backend?",
    );
  }

  private async listen(): Promise<void> {
    await this.audioTrack?.unmute();
  }

  private async stopListening(): Promise<void> {
    await this.audioTrack?.mute();
  }

  /** "Fertig"-Knopf: sofort bewerten, statt auf die Stille zu warten. */
  async flush(): Promise<void> {
    if (!this.room || !this.isConnected()) return;
    await this.room.localParticipant.publishData(encode({ cmd: "flush" }), {
      reliable: true,
    });
  }

  /**
   * Laufende Runde abbrechen. Ohne das wuerde die Warteschlange bis zum
   * Timeout blockieren und ein sofortiges "Nochmal" haette keine Wirkung.
   * Das Mikrofon geht zu; das naechste Zielwort setzt die Puffer des Agents
   * ohnehin zurueck, ein verspaetetes Ergebnis wird verworfen.
   */
  cancel(): void {
    this.abortTurn?.(new TurnCancelled());
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  // --- Turn-Mechanik ------------------------------------------------------

  /**
   * Eine Runde fahren. `reduce` bekommt jedes Ergebnis-Frame und gibt einen
   * Wert zurueck, sobald die Runde fertig ist (undefined = weiter warten).
   */
  private turn<T>(args: {
    mode: "word" | "ayah";
    target: string;
    timeoutMs: number;
    reduce: (frame: any) => T | undefined;
    beforeListen?: () => Promise<void>;
    onScoring?: () => void;
  }): Promise<{ value: T; timings: TurnTimings }> {
    const { mode, target, timeoutMs, reduce, beforeListen, onScoring } = args;
    return this.enqueue(async () => {
      const t0 = Date.now();
      const warm = this.isConnected();
      const room = await this.connect();
      const connect_ms = Date.now() - t0;
      await this.waitForAgent(room);

      let settled = false;
      let tReady = 0;
      let tScoring = 0;
      let tFirstFrame = 0;
      let markReady!: () => void;
      let finish!: (v: T) => void;
      let fail!: (e: Error) => void;

      const ready = new Promise<void>((resolve) => {
        markReady = resolve;
      });
      const result = new Promise<T>((resolve, reject) => {
        finish = resolve;
        fail = reject;
      });

      this.frameHandler = (frame) => {
        if (settled) return;
        if (frame?.error) {
          settled = true;
          fail(new Error(String(frame.error)));
          return;
        }
        if (frame?.kind === "ready") {
          tReady = Date.now();
          markReady();
          return;
        }
        // Sprachende erkannt: Mikrofon zu, damit der Nachhall der naechsten
        // Runde nicht in diese hier laeuft, und die UI umschalten lassen.
        if (frame?.kind === "scoring") {
          tScoring = Date.now();
          this.stopListening().catch(() => {});
          useDebug.getState().push("lk_scoring", `Sprachende (${frame.reason ?? "?"})`);
          onScoring?.();
          return;
        }
        if (!tFirstFrame) tFirstFrame = Date.now();
        try {
          const value = reduce(frame);
          if (value !== undefined) {
            settled = true;
            finish(value);
          }
        } catch (e: any) {
          settled = true;
          fail(e instanceof Error ? e : new Error(String(e)));
        }
      };
      this.abortTurn = (e) => {
        if (settled) return;
        settled = true;
        fail(e);
      };

      try {
        const payload =
          mode === "ayah" ? { mode: "ayah", ayah: target } : { mode: "word", target };
        const tSent = Date.now();
        await room.localParticipant.publishData(encode(payload), { reliable: true });

        // `result` mitrennen lassen: ein Fehler-Frame soll hier schon abbrechen.
        await withTimeout(
          Promise.race([ready, result]),
          READY_TIMEOUT_MS,
          "Der Agent hat das Zielwort nicht bestätigt.",
        );
        const ready_ms = (tReady || Date.now()) - tSent;

        // TTS spricht hier - Mikrofon ist noch zu, sonst bewertet der Agent
        // die eigene Sprachausgabe statt das Kind.
        if (beforeListen) await beforeListen();

        await this.listen();
        const tListen = Date.now();

        const value = await withTimeout(
          result,
          timeoutMs,
          "Zeitüberschreitung: keine Bewertung erhalten.",
        );

        const tEnd = Date.now();
        // Wann der Agent aufgehoert hat zuzuhoeren, weiss nur das
        // scoring-Paket; ohne es faellt die Grenze auf das erste Ergebnis.
        const tCut = tScoring || tFirstFrame || tEnd;
        return {
          value,
          timings: {
            connect_ms,
            ready_ms,
            listen_ms: tCut - tListen,
            score_ms: (tFirstFrame || tEnd) - tCut,
            stream_ms: tFirstFrame ? tEnd - tFirstFrame : 0,
            total_ms: tEnd - t0,
            warm,
          },
        };
      } finally {
        settled = true;
        this.frameHandler = null;
        this.abortTurn = null;
        await this.stopListening().catch(() => {});
      }
    });
  }

  // --- Oeffentliche Bewertungs-Aufrufe -------------------------------------

  async assessWord(
    target: string,
    opts: TurnOptions = {},
  ): Promise<{ result: ScoreResult; timings: TurnTimings }> {
    const { value, timings } = await this.turn<ScoreResult>({
      mode: "word",
      target,
      timeoutMs: WORD_TIMEOUT_MS,
      beforeListen: opts.beforeListen,
      onScoring: opts.onScoring,
      // Im Wortmodus ist das erste Ergebnis-Frame schon das Ergebnis.
      reduce: (frame) => frame as ScoreResult,
    });
    useDebug
      .getState()
      .push("lk_word", `${Math.round(value.total)} Punkte in ${timings.total_ms}ms`, {
        warm: timings.warm ? 1 : 0,
        connect_ms: timings.connect_ms,
        ready_ms: timings.ready_ms,
        listen_ms: timings.listen_ms,
        score_ms: timings.score_ms,
        server_ms: value.duration_ms,
        asr_ms: value.timings?.asr_ms ?? null,
      });
    return { result: value, timings };
  }

  async assessAyah(
    ayahText: string,
    onProgress: (ev: AyahProgress) => void,
    opts: TurnOptions = {},
  ): Promise<{ done: AyahDoneEvent; timings: TurnTimings }> {
    useDebug.getState().push("lk_ayah_start", `Ayah senden (${ayahText.slice(0, 30)}…)`);
    const { value, timings } = await this.turn<AyahDoneEvent>({
      mode: "ayah",
      target: ayahText,
      timeoutMs: AYAH_TIMEOUT_MS,
      beforeListen: opts.beforeListen,
      onScoring: opts.onScoring,
      reduce: (frame) => {
        if (frame?.kind === "start" || frame?.kind === "word") {
          onProgress(frame as AyahProgress);
          return undefined;
        }
        if (frame?.kind === "done") {
          onProgress(frame as AyahProgress);
          return frame as AyahDoneEvent;
        }
        return undefined;
      },
    });
    useDebug
      .getState()
      .push("lk_ayah_done", `done ${timings.total_ms}ms (Server ${value.duration_ms}ms)`, {
        words: value.words_count,
        ready_ms: timings.ready_ms,
        listen_ms: timings.listen_ms,
        score_ms: timings.score_ms,
        stream_ms: timings.stream_ms,
        server_ms: value.duration_ms,
        asr_ms: value.timings?.asr_ms ?? null,
      });
    return { done: value, timings };
  }

  dispose(): void {
    this.frameHandler = null;
    this.abortTurn?.(new TurnCancelled());
    this.abortTurn = null;
    this.audioTrack?.stop();
    this.setAudioTrack(null);
    this.trackListeners.clear();
    this.room?.disconnect();
    this.room = null;
    this.connecting = null;
    if (this.audioSessionStarted) {
      this.audioSessionStarted = false;
      // Das Flag steht nur, wenn connect() das Modul schon geladen hat -
      // requireLiveKit() kann hier also nicht werfen.
      requireLiveKit().AudioSession.stopAudioSession().catch(() => {});
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton pro Config
// ---------------------------------------------------------------------------

let cached: { config: LiveKitConfig; session: LiveKitSession } | null = null;

export function getLiveKitSession(config: LiveKitConfig): LiveKitSession {
  if (
    !cached ||
    cached.config.tokenEndpoint !== config.tokenEndpoint ||
    cached.config.identity !== config.identity
  ) {
    cached?.session.dispose();
    cached = { config, session: new LiveKitSession(config) };
  }
  return cached.session;
}

/** Schliesst und verwirft die Singleton-Session (z.B. bei Endpoint-Wechsel). */
export function closeLiveKitSession(): void {
  cached?.session.dispose();
  cached = null;
}

export { LiveKitSession };
