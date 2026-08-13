import { Platform } from "react-native";

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

function inferFilename(uri: string): { name: string; type: string } {
  const clean = uri.split("?")[0].split("#")[0];
  const lower = clean.toLowerCase();
  if (lower.endsWith(".m4a") || lower.endsWith(".mp4")) return { name: "rec.m4a", type: "audio/m4a" };
  if (lower.endsWith(".webm")) return { name: "rec.webm", type: "audio/webm" };
  if (lower.endsWith(".wav"))  return { name: "rec.wav",  type: "audio/wav" };
  if (lower.endsWith(".ogg"))  return { name: "rec.ogg",  type: "audio/ogg" };
  return { name: "rec.m4a", type: "audio/m4a" };
}

export async function assessAudio(
  backendUrl: string,
  audioUri: string,
  target: string,
): Promise<AssessResponse> {
  const url = backendUrl.replace(/\/$/, "") + "/assess";
  const form = new FormData();
  const meta = inferFilename(audioUri);

  if (Platform.OS === "web") {
    // Browser: URI in Blob laden und als echte Datei anhängen.
    const blob = await (await fetch(audioUri)).blob();
    form.append("audio", new File([blob], meta.name, { type: meta.type }));
  } else {
    // React Native: fetch versteht {uri, name, type} nativ.
    form.append("audio", { uri: audioUri, name: meta.name, type: meta.type } as any);
  }
  form.append("target", target);

  const res = await fetch(url, { method: "POST", body: form });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json();
}

export async function pingHealth(backendUrl: string): Promise<boolean> {
  try {
    const url = backendUrl.replace(/\/$/, "") + "/health";
    const res = await fetch(url, { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}

export type HealthReport = {
  ok: boolean;
  hasStream: boolean;
  model?: string;
  device?: string;
  raw?: any;
  error?: string;
};

export async function fetchHealth(backendUrl: string): Promise<HealthReport> {
  try {
    const url = backendUrl.replace(/\/$/, "") + "/health";
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) return { ok: false, hasStream: false, error: `HTTP ${res.status}` };
    const raw = await res.json();
    const eps: string[] = Array.isArray(raw?.endpoints) ? raw.endpoints : [];
    const hasStream = eps.some((e) => String(e).toLowerCase().includes("stream"));
    return { ok: true, hasStream, model: raw?.asr_model, device: raw?.device, raw };
  } catch (e: any) {
    return { ok: false, hasStream: false, error: e?.message ?? "Netzwerkfehler" };
  }
}

// Waehlt je nach Nutzer-Einstellung HTTP-POST oder persistente WebSocket-Session.
// Streaming spart pro Wort ~500ms (kein TLS/Cloudflared-Reconnect), bei identischer
// Bewertungsqualitaet (Backend ruft dieselbe _score_word-Pipeline auf).
import { getStreamSession } from "./stream";

export type AssessMeta = { mode: "ws" | "http" | "http-fallback"; totalMs: number };

export async function assessAudioSmart(
  backendUrl: string,
  audioUri: string,
  target: string,
  streaming: boolean,
): Promise<AssessResponse & { _meta: AssessMeta }> {
  const t0 = Date.now();
  if (streaming) {
    try {
      const r = await getStreamSession(backendUrl).assess(audioUri, target);
      return { ...r, _meta: { mode: "ws", totalMs: Date.now() - t0 } };
    } catch {
      const r = await assessAudio(backendUrl, audioUri, target);
      return { ...r, _meta: { mode: "http-fallback", totalMs: Date.now() - t0 } };
    }
  }
  const r = await assessAudio(backendUrl, audioUri, target);
  return { ...r, _meta: { mode: "http", totalMs: Date.now() - t0 } };
}
