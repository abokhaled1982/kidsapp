// LiveKit-basierte Audio-Session zum Backend.
//
// Ersetzt stream.ts (WebSocket) komplett:
//   - Audio geht als LiveKit Audio Track (WebRTC/Opus) zum Server
//   - Ergebnisse kommen via DataChannel (JSON) zurueck
//   - Kein Audio-Processing auf dem Client
//   - LiveKit handled Reconnection, NAT traversal, adaptive bitrate
//
// Voraussetzungen:
//   - @livekit/react-native + @livekit/react-native-webrtc installiert
//   - EAS Dev-Client Build (kein Expo Go)
//   - LiveKit Cloud Account mit API Key

import {
  Room,
  RoomEvent,
  DataPacket_Kind,
  LocalAudioTrack,
  createLocalAudioTrack,
  ConnectionState,
} from "@livekit/react-native";
import type { AssessResponse } from "@/lib/api";

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

export type LiveKitConfig = {
  /** Modal Token-Endpoint URL (https://...--quran-asr-livekit-get-token.modal.run) */
  tokenEndpoint: string;
  /** User-Identity (fuer Room-Zuweisung) */
  identity: string;
};

/** Holt LiveKit JWT + URL vom Modal Token-Endpoint. */
async function fetchLiveKitToken(config: LiveKitConfig): Promise<{
  token: string;
  url: string;
  room: string;
}> {
  const res = await fetch(config.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: config.identity, room: "quran-pronunciation" }),
  });
  if (!res.ok) throw new Error(`Token-Endpoint: ${res.status}`);
  return res.json();
}

export type ScoreResult = AssessResponse & {
  duration_ms: number;
  timings?: {
    audio_samples?: number;
    audio_ms?: number;
    preprocess_ms?: number;
    asr_ms?: number;
    score_ms?: number;
  };
};

export type LiveKitTimings = {
  target_sent_ms: number;
  score_received_ms: number;
  total_ms: number;
};

// ---------------------------------------------------------------------------
// LiveKit Session
// ---------------------------------------------------------------------------

class LiveKitSession {
  private room: Room | null = null;
  private audioTrack: LocalAudioTrack | null = null;
  private config: LiveKitConfig;
  private scoreResolve: ((result: ScoreResult) => void) | null = null;
  private scoreReject: ((error: Error) => void) | null = null;
  private connected = false;

  constructor(config: LiveKitConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.connected && this.room?.state === ConnectionState.Connected) {
      return;
    }
    this.room = new Room();

    this.room.on(RoomEvent.DataReceived, (data: Uint8Array) => {
      try {
        const msg = JSON.parse(new TextDecoder().decode(data));
        if (this.scoreResolve) {
          if (msg.error) {
            this.scoreReject?.(new Error(msg.error));
          } else {
            this.scoreResolve(msg as ScoreResult);
          }
          this.scoreResolve = null;
          this.scoreReject = null;
        }
      } catch (e) {
        console.warn("[LiveKit] DataChannel parse error:", e);
      }
    });

    this.room.on(RoomEvent.Reconnecting, () => console.log("[LiveKit] Reconnecting..."));
    this.room.on(RoomEvent.Reconnected, () => console.log("[LiveKit] Reconnected"));
    this.room.on(RoomEvent.Disconnected, () => {
      console.log("[LiveKit] Disconnected");
      this.connected = false;
    });

    // Token vom Modal-Endpoint holen und verbinden
    const { token, url } = await fetchLiveKitToken(this.config);
    await this.room.connect(url, token);
    this.connected = true;

    this.audioTrack = await createLocalAudioTrack({
      echoCancellation: false,
      noiseSuppression: true,
      sampleRate: 16000,
    });
    await this.room.localParticipant.publishTrack(this.audioTrack);
    console.log("[LiveKit] Connected + Audio published");
  }

  mute(): void { this.audioTrack?.mute(); }
  unmute(): void { this.audioTrack?.unmute(); }


  /**
   * Wort bewerten:
   *   1. Target-Wort via DataChannel an Agent senden
   *   2. Mikrofon unmuten → Kind spricht → Audio live zum Agent
   *   3. Agent erkennt End-of-Speech → sendet Score via DataChannel
   *   4. Mikrofon muten
   */
  async assessWord(target: string, timeoutMs = 10000): Promise<{
    result: ScoreResult;
    timings: LiveKitTimings;
  }> {
    if (!this.room || !this.connected) await this.connect();
    const t0 = Date.now();

    const payload = new TextEncoder().encode(JSON.stringify({ target }));
    await this.room!.localParticipant.publishData(payload, { reliable: true });
    const tSent = Date.now();

    this.unmute();

    const result = await new Promise<ScoreResult>((resolve, reject) => {
      this.scoreResolve = resolve;
      this.scoreReject = reject;
      setTimeout(() => {
        if (this.scoreResolve) {
          this.scoreResolve = null;
          this.scoreReject = null;
          reject(new Error("Score-Timeout: Agent hat nicht geantwortet."));
        }
      }, timeoutMs);
    });

    this.mute();
    const tDone = Date.now();
    return {
      result,
      timings: {
        target_sent_ms: tSent - t0,
        score_received_ms: tDone - tSent,
        total_ms: tDone - t0,
      },
    };
  }

  isConnected(): boolean {
    return this.connected && this.room?.state === ConnectionState.Connected;
  }

  dispose(): void {
    this.audioTrack?.stop();
    this.audioTrack = null;
    this.room?.disconnect();
    this.room = null;
    this.connected = false;
    this.scoreResolve = null;
    this.scoreReject = null;
  }
}

// ---------------------------------------------------------------------------
// Singleton
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

export function closeLiveKitSession(): void {
  cached?.session.dispose();
  cached = null;
}

export { LiveKitSession };

