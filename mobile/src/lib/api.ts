// Daten-Vertrag zum Backend + Diagnose.
//
// Transport ist ausschliesslich LiveKit (livekit-stream.ts); Bewertungen laufen
// ueber useLiveKitTurn, damit die UI den Rundenstatus mitbekommt. Hier bleiben
// nur die Typen, die das Backend sendet, und der Health-Check der Einstellungen.
//
// Die Typen stehen absichtlich in diesem Modul: livekit-stream.ts zieht sie per
// `import type`, was beim Kompilieren verschwindet - also kein Zyklus.

import { getLiveKitSession, type LiveKitConfig, type TurnTimings } from "@/lib/livekit-stream";

export type AssessUnit = {
  label: string;
  recognized?: string | null;
  match?: boolean;
  score: number;
  confidence: number;
  llr?: number | null;
  error_hint?: string | null;
  articulation?: number;
  tajweed?: number;
  duration_ms?: number;
};

export type ServerWordTimings = {
  audio_samples?: number;
  audio_ms?: number;
  preprocess_ms?: number;
  asr_ms?: number;
  align_ms?: number;
  score_ms?: number;
  server_ms?: number;
};

export type AssessResponse = {
  target: string;
  transcription: string;
  units: AssessUnit[];
  total: number;
  duration_ms: number;
  timings?: ServerWordTimings;
};

/** Client-Sicht auf eine Runde, fuer die Latenz-Anzeige im Elternmodus. */
export type AssessMeta = {
  mode: "livekit";
  totalMs: number;
  turn: TurnTimings;
};

// --------------------------------------------------------------------------
// Diagnose (Settings-Screen)
// --------------------------------------------------------------------------

export type HealthInfo = {
  ok: boolean;
  /** Token-Endpoint hat geantwortet und der Room steht. */
  hasRoom: boolean;
  /** Der Scoring-Agent ist im Room. Ohne ihn bewertet niemand. */
  hasAgent: boolean;
  connectMs?: number;
  error?: string;
};

export async function pingHealth(config: LiveKitConfig): Promise<boolean> {
  return (await fetchHealth(config)).ok;
}

/**
 * Token holen, Room verbinden, pruefen ob der Agent da ist.
 *
 * Laeuft absichtlich ueber die Singleton-Session: der Check waermt damit gleich
 * die Verbindung auf, die die Uebungs-Screens danach benutzen.
 */
export async function fetchHealth(config: LiveKitConfig): Promise<HealthInfo> {
  if (!config.tokenEndpoint) {
    return { ok: false, hasRoom: false, hasAgent: false, error: "kein Token-Endpoint" };
  }
  const t0 = Date.now();
  try {
    const hasAgent = await getLiveKitSession(config).probe();
    return { ok: hasAgent, hasRoom: true, hasAgent, connectMs: Date.now() - t0 };
  } catch (e: any) {
    return {
      ok: false,
      hasRoom: false,
      hasAgent: false,
      connectMs: Date.now() - t0,
      error: e?.message ?? String(e),
    };
  }
}
