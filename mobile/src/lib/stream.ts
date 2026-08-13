// Persistente WebSocket-Session zum Backend.
//
// Zwei Aufgaben:
//   A) assessWord(uri, target)   -> Promise<AssessResponse>
//   B) assessAyah(uri, ayah, cb) -> Promise<AyahDoneEvent>
//        cb liefert pro erkanntem Wort ein Progress-Event zurück, damit
//        die UI die Wörter progressiv einfärben kann.
//
// Design-Entscheidungen (siehe /memories/repo/quran-app-websocket.md):
//   - HTTPS wird zu WSS gemappt (Cloudflared Quick Tunnel).
//   - Server-Keep-Alive alle 20s ("ping":true) wird stumm ignoriert.
//   - Circuit-Breaker: nach 2 aufeinanderfolgenden Fehlern kein WS-Versuch
//     für 20s -> Client fällt sofort in HTTP-Fallback (kein Multi-Sekunden-
//     Stall bei Cloudflared-Ausfall).
//   - warmUp() als fire-and-forget beim Screen-Mount, damit das erste Wort
//     nicht die Connect-Latenz bezahlt.

import { readUriAsArrayBuffer } from "@/lib/audioBytes";
import type { AssessResponse } from "@/lib/api";

const CONNECT_TIMEOUT_MS  = 7000;
const REQUEST_TIMEOUT_MS  = 15000;
const AYAH_TIMEOUT_MS     = 25000;
const CIRCUIT_TRIP_AT     = 2;
const CIRCUIT_COOLDOWN_MS = 20000;

// --- Ayah-Frame-Typen (spiegelt Backend-JSON) ---
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
  units: Array<{
    label: string;
    score: number;
    confidence: number;
    llr?: number | null;
    error_hint?: string | null;
  }>;
};
export type AyahDoneEvent = {
  kind: "done";
  total: number;
  words_count: number;
  duration_ms: number;
};
export type AyahProgress = AyahStartEvent | AyahWordEvent | AyahDoneEvent;

function httpToWs(url: string): string {
  if (!url) return url;
  if (url.startsWith("wss://") || url.startsWith("ws://")) return url;
  return url.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
}

class StreamSession {
  private ws: WebSocket | null = null;
  private connecting: Promise<WebSocket> | null = null;
  private queue: Promise<any> = Promise.resolve();
  private failStreak = 0;
  private circuitOpenUntil = 0;

  constructor(private backendUrl: string) {}

  /** Public convenience: baut die Verbindung auf und wartet auf OPEN. */
  ensureConnected(): Promise<void> {
    return this.connect().then(() => undefined);
  }

  /** Public alias fuer dispose() zur externen Nutzung. */
  close(): void { this.dispose(); }
  private isCircuitOpen(): boolean {
    return Date.now() < this.circuitOpenUntil;
  }

  private tripCircuit() {
    this.failStreak++;
    if (this.failStreak >= CIRCUIT_TRIP_AT) {
      this.circuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
    }
  }

  private resetCircuit() {
    this.failStreak = 0;
    this.circuitOpenUntil = 0;
  }

  private closeSocket() {
    if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
      try { this.ws.close(); } catch {}
    }
    this.ws = null;
    this.connecting = null;
  }

  private connect(): Promise<WebSocket> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return Promise.resolve(this.ws);
    }
    if (this.connecting) return this.connecting;

    this.connecting = new Promise<WebSocket>((resolve, reject) => {
      const url = `${httpToWs(this.backendUrl)}/stream`;
      let ws: WebSocket;
      try { ws = new WebSocket(url); }
      catch (e: any) { return reject(new Error(`WS-Konstruktor: ${e?.message ?? e}`)); }

      const to = setTimeout(() => {
        try { ws.close(); } catch {}
        reject(new Error("WS-Connect-Timeout"));
      }, CONNECT_TIMEOUT_MS);

      ws.onopen = () => {
        clearTimeout(to);
        this.ws = ws;
        resolve(ws);
      };
      ws.onerror = () => {
        clearTimeout(to);
        this.ws = null;
        reject(new Error("WS-Error beim Connect"));
      };
      ws.onclose = () => {
        // Session-lokaler Handler: bei laufender Anfrage muss der jeweilige
        // Request-Wrapper das mitkriegen -> per Fehler-Reject bei nächstem Send.
        if (this.ws === ws) this.ws = null;
        this.connecting = null;
      };
    });
    return this.connecting;
  }

  warmUp(): void {
    if (this.isCircuitOpen()) return;
    this.connect().catch(() => { /* still */ });
  }

  /** Serialisiert Aufrufe, damit Wort/Ayah-Requests sich nicht überlappen. */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  assessWord(uri: string, target: string): Promise<AssessResponse> {
    if (this.isCircuitOpen()) return Promise.reject(new Error("WS-Circuit offen"));

    return this.enqueue(async () => {
      const ws = await this.connect();
      const bytes = await readUriAsArrayBuffer(uri);

      return await new Promise<AssessResponse>((resolve, reject) => {
        const to = setTimeout(() => {
          this.tripCircuit();
          this.closeSocket();
          reject(new Error("WS-Request-Timeout"));
        }, REQUEST_TIMEOUT_MS);

        const onMsg = (ev: MessageEvent) => {
          try {
            const data = JSON.parse(String(ev.data));
            if (data?.ping) return;                 // keep-alive -> ignore
            if (data?.error) {
              cleanup();
              this.tripCircuit();
              reject(new Error(String(data.error)));
              return;
            }
            cleanup();
            this.resetCircuit();
            resolve(data as AssessResponse);
          } catch (e: any) {
            cleanup();
            this.tripCircuit();
            reject(new Error(`JSON-Parse: ${e?.message ?? e}`));
          }
        };
        const onErr = () => {
          cleanup();
          this.tripCircuit();
          this.closeSocket();
          reject(new Error("WS-Error während Request"));
        };
        const onClose = () => {
          cleanup();
          this.tripCircuit();
          reject(new Error("WS-Close während Request"));
        };
        const cleanup = () => {
          clearTimeout(to);
          ws.removeEventListener("message", onMsg as any);
          ws.removeEventListener("error", onErr as any);
          ws.removeEventListener("close", onClose as any);
        };

        ws.addEventListener("message", onMsg as any);
        ws.addEventListener("error", onErr as any);
        ws.addEventListener("close", onClose as any);

        try {
          ws.send(JSON.stringify({ target }));
          ws.send(bytes);
        } catch (e: any) {
          cleanup();
          this.tripCircuit();
          this.closeSocket();
          reject(new Error(`WS-Send-Fehler: ${e?.message ?? e}`));
        }
      });
    });
  }

  /**
   * Sendet die ganze Ayah-Audio und ruft `onProgress` für JEDES eingehende
   * Server-Frame (start / word / done). Aufloest mit dem Done-Event; Fehler
   * -> reject, Client fällt in HTTP-Wort-Fallback zurück (via api.assessAudioHttp).
   */
  assessAyah(
    uri: string,
    ayahText: string,
    onProgress: (ev: AyahProgress) => void,
  ): Promise<AyahDoneEvent> {
    if (this.isCircuitOpen()) return Promise.reject(new Error("WS-Circuit offen"));

    return this.enqueue(async () => {
      const ws = await this.connect();
      const bytes = await readUriAsArrayBuffer(uri);

      return await new Promise<AyahDoneEvent>((resolve, reject) => {
        const to = setTimeout(() => {
          this.tripCircuit();
          this.closeSocket();
          reject(new Error("WS-Ayah-Timeout"));
        }, AYAH_TIMEOUT_MS);

        const onMsg = (ev: MessageEvent) => {
          try {
            const data = JSON.parse(String(ev.data));
            if (data?.ping) return;
            if (data?.error) {
              cleanup();
              this.tripCircuit();
              reject(new Error(String(data.error)));
              return;
            }
            if (data?.kind === "start" || data?.kind === "word") {
              onProgress(data as AyahProgress);
              return;
            }
            if (data?.kind === "done") {
              onProgress(data as AyahProgress);
              cleanup();
              this.resetCircuit();
              resolve(data as AyahDoneEvent);
              return;
            }
          } catch (e: any) {
            cleanup();
            this.tripCircuit();
            reject(new Error(`JSON-Parse: ${e?.message ?? e}`));
          }
        };
        const onErr = () => {
          cleanup();
          this.tripCircuit();
          this.closeSocket();
          reject(new Error("WS-Error während Ayah-Request"));
        };
        const onClose = () => {
          cleanup();
          this.tripCircuit();
          reject(new Error("WS-Close während Ayah-Request"));
        };
        const cleanup = () => {
          clearTimeout(to);
          ws.removeEventListener("message", onMsg as any);
          ws.removeEventListener("error", onErr as any);
          ws.removeEventListener("close", onClose as any);
        };

        ws.addEventListener("message", onMsg as any);
        ws.addEventListener("error", onErr as any);
        ws.addEventListener("close", onClose as any);

        try {
          ws.send(JSON.stringify({ mode: "ayah", ayah: ayahText }));
          ws.send(bytes);
        } catch (e: any) {
          cleanup();
          this.tripCircuit();
          this.closeSocket();
          reject(new Error(`WS-Send-Fehler: ${e?.message ?? e}`));
        }
      });
    });
  }

  dispose() {
    this.closeSocket();
  }
}

// Singleton-Cache pro Backend-URL. Wechsel der URL => alte Session schliessen.
let cached: { url: string; session: StreamSession } | null = null;

export function getStreamSession(backendUrl: string): StreamSession {
  if (!cached || cached.url !== backendUrl) {
    cached?.session.dispose();
    cached = { url: backendUrl, session: new StreamSession(backendUrl) };
  }
  return cached.session;
}

/** Schliesst und verwirft die Singleton-Session (z.B. bei URL-Wechsel im Settings). */
export function closeStreamSession(): void {
  cached?.session.dispose();
  cached = null;
}

export { StreamSession };
