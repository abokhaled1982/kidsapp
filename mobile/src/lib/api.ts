// HTTP-Endpoint + geteilte Typen. Wird vom Play-Modus (Einzelwörter) direkt
// und vom Quran-Modus als Fallback verwendet, wenn die WS-Session nicht steht.

import { getStreamSession } from "@/lib/stream";
import { readUriAsArrayBuffer } from "@/lib/audioBytes";
export { readUriAsArrayBuffer };
export type AssessUnit = {
  label: string;
  score: number;
  confidence: number;
  llr?: number | null;
  error_hint?: string | null;
};

export type AssessResponse = {
  target: string;
  transcription: string;
  units: AssessUnit[];
  total: number;
  duration_ms: number;
};

export type AssessMeta = {
  mode: "http" | "ws" | "http-fallback";
  totalMs: number;
};

const HTTP_TIMEOUT_MS = 15000;

function inferFilename(uri: string): string {
  const ext = uri.split(".").pop()?.toLowerCase() ?? "m4a";
  return `rec.${ext}`;
}

function inferMime(uri: string): string {
  const ext = uri.split(".").pop()?.toLowerCase();
  if (ext === "wav") return "audio/wav";
  if (ext === "webm") return "audio/webm";
  if (ext === "mp3") return "audio/mpeg";
  return "audio/mp4";
}

/** HTTP-Fallback: klassisches multipart/form-data POST /assess. */
export async function assessAudioHttp(
  backendUrl: string,
  uri: string,
  target: string,
): Promise<AssessResponse & { _meta: AssessMeta }> {
  if (!backendUrl) throw new Error("Backend-URL fehlt.");
  const t0 = Date.now();
  const form = new FormData();
  // React Native FormData akzeptiert das {uri,name,type}-Format
  form.append("audio", { uri, name: inferFilename(uri), type: inferMime(uri) } as any);
  form.append("target", target);

  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(`${backendUrl}/assess`, {
      method: "POST",
      body: form as any,
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}: ${txt || res.statusText}`);
    }
    const data = (await res.json()) as AssessResponse;
    return { ...data, _meta: { mode: "http", totalMs: Date.now() - t0 } };
  } finally {
    clearTimeout(to);
  }
}

/**
 * Smart-Assess: bevorzugt die persistente WS-Session (niedrige Latenz),
 * fällt bei Fehler transparent auf HTTP zurück.
 */
export async function assessAudioSmart(
  backendUrl: string,
  uri: string,
  target: string,
  useStreaming: boolean,
): Promise<AssessResponse & { _meta: AssessMeta }> {
  const t0 = Date.now();
  if (useStreaming) {
    const session = getStreamSession(backendUrl);
    try {
      const r = await session.assessWord(uri, target);
      return { ...r, _meta: { mode: "ws", totalMs: Date.now() - t0 } };
    } catch {
      // stiller Fallback
      const r = await assessAudioHttp(backendUrl, uri, target);
      return { ...r, _meta: { mode: "http-fallback", totalMs: Date.now() - t0 } };
    }
  }
  const r = await assessAudioHttp(backendUrl, uri, target);
  return r;
}

// --------------------------------------------------------------------------
// Health / Diagnose (fuer Settings-Screen)
// --------------------------------------------------------------------------

export type HealthInfo = {
  ok: boolean;
  model?: string;
  device?: string;
  hasStream: boolean;
  error?: string;
};

export async function pingHealth(url: string): Promise<boolean> {
  return (await fetchHealth(url)).ok;
}

export async function fetchHealth(url: string): Promise<HealthInfo> {
  if (!url) return { ok: false, hasStream: false, error: "keine URL" };
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(`${url}/health`, { signal: ctrl.signal });
    if (!res.ok) return { ok: false, hasStream: false, error: `HTTP ${res.status}` };
    const j = await res.json();
    const endpoints: string[] = Array.isArray(j.endpoints) ? j.endpoints : [];
    return {
      ok: true,
      model: j.asr_model ?? j.model,
      device: j.device,
      hasStream: endpoints.some((e) => e.toLowerCase().includes("stream")),
    };
  } catch (e: any) {
    return { ok: false, hasStream: false, error: e?.message ?? String(e) };
  } finally {
    clearTimeout(to);
  }
}
