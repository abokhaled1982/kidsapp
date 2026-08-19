// WebSocket-only Backend-Anbindung. HTTP-Pfade wurden entfernt -
// Bewertung und Health-Check laufen ausschliesslich ueber /stream.

import { getStreamSession, StreamSession, type WordClientTimings } from "@/lib/stream";
import { readUriAsArrayBuffer } from "@/lib/audioBytes";
export { readUriAsArrayBuffer };

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
  audio_bytes?: number;
  audio_samples?: number;
  audio_ms?: number;
  preprocess_ms?: number;
  asr_ms?: number;
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

export type AssessMeta = {
  mode: "ws";
  totalMs: number;
  client?: WordClientTimings;
};

/** Einzelwort ueber die persistente WS-Session bewerten. */
export async function assessAudioSmart(
  backendUrl: string,
  uri: string,
  target: string,
  token: string = "",
): Promise<AssessResponse & { _meta: AssessMeta }> {
  const t0 = Date.now();
  const session = getStreamSession(backendUrl, token);
  const { response, client } = await session.assessWord(uri, target);
  return { ...response, _meta: { mode: "ws", totalMs: Date.now() - t0, client } };
}

// --------------------------------------------------------------------------
// Health / Diagnose (fuer Settings-Screen) - reine WS-Pruefung.
// --------------------------------------------------------------------------

export type HealthInfo = {
  ok: boolean;
  hasStream: boolean;
  connectMs?: number;
  error?: string;
};

export async function pingHealth(url: string, token: string = ""): Promise<boolean> {
  return (await fetchHealth(url, token)).ok;
}

export async function fetchHealth(url: string, token: string = ""): Promise<HealthInfo> {
  if (!url) return { ok: false, hasStream: false, error: "keine URL" };
  const s = new StreamSession(url, token);
  const t0 = Date.now();
  try {
    await s.ensureConnected();
    return { ok: true, hasStream: true, connectMs: Date.now() - t0 };
  } catch (e: any) {
    return { ok: false, hasStream: false, error: e?.message ?? String(e) };
  } finally {
    s.close();
  }
}
