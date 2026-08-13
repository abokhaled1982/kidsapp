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
