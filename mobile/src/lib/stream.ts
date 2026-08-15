// Persistente WebSocket-Session zum Backend.
//
// Zwei Aufgaben:
//   A) assessWord(uri, target)   -> Promise<AssessResponse>
//   B) assessAyah(uri, ayah, cb) -> Promise<AyahDoneEvent>
//        cb liefert pro erkanntem Wort ein Progress-Event zurück, damit
//        die UI die Wörter progressiv einfärben kann.
//
// Design-Entscheidungen (siehe /memories/repo/quran-app-websocket.md):
//   - HTTPS wird zu WSS gemappt (ngrok / Cloudflared Quick Tunnel).
//   - Server-Keep-Alive alle 20s ("ping":true) wird stumm ignoriert.
//   - warmUp() als fire-and-forget beim Screen-Mount, damit das erste Wort
//     nicht die Connect-Latenz bezahlt.
//   - HTTP-Fallback existiert nicht mehr: Fehler werden hoch propagiert und
//     als Fehlerzustand in der UI angezeigt.

import { readUriAsArrayBuffer } from "@/lib/audioBytes";
import { useDebug } from "@/store/useDebug";
import type { AssessResponse } from "@/lib/api";

const CONNECT_TIMEOUT_MS  = 7000;
const REQUEST_TIMEOUT_MS  = 15000;
const AYAH_TIMEOUT_MS     = 25000;

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
  timings?: {
    audio_bytes?: number;
    audio_samples?: number;
    audio_ms?: number;
    bytes_recv_ms?: number;
    preprocess_ms?: number;
    asr_ms?: number;
    align_ms?: number;
    score_ms?: number;
  };
};
export type AyahProgress = AyahStartEvent | AyahWordEvent | AyahDoneEvent;

/** Client-seitige Latenz-Aufschluesselung fuer Diagnose (Anzeige + Log). */
export type AyahClientTimings = {
  bytes_read_ms: number;     // URI -> ArrayBuffer
  ws_send_ms: number;        // ws.send(text+bytes)
  first_frame_ms: number;    // vom Send bis "start"-Frame (~ RTT + Backend-Compute)
  last_frame_ms: number;     // vom Send bis "done"-Frame
  bytes: number;
};

/** Analog fuer Einzelwort-Antworten. */
export type WordClientTimings = {
  connect_ms: number;
  bytes_read_ms: number;
  ws_send_ms: number;
  rtt_ms: number;
  bytes: number;
  warm: boolean;
};

function httpToWs(url: string): string {
  if (!url) return url;
  if (url.startsWith("wss://") || url.startsWith("ws://")) return url;
  return url.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
}

class StreamSession {
  private ws: WebSocket | null = null;
  private connecting: Promise<WebSocket> | null = null;
  private queue: Promise<any> = Promise.resolve();

  constructor(private backendUrl: string, private token: string = "") {}

  /** Public convenience: baut die Verbindung auf und wartet auf OPEN. */
  ensureConnected(): Promise<void> {
    return this.connect().then(() => undefined);
  }

  /** Public alias fuer dispose() zur externen Nutzung. */
  close(): void { this.dispose(); }

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
      const base = `${httpToWs(this.backendUrl)}/stream`;
      const url = this.token ? `${base}?token=${encodeURIComponent(this.token)}` : base;
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
        useDebug.getState().push("ws_open", `WS verbunden ${url}`);
        resolve(ws);
      };
      ws.onerror = () => {
        clearTimeout(to);
        this.ws = null;
        useDebug.getState().push("ws_error", "WS onerror beim Connect");
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

  assessWord(uri: string, target: string): Promise<{ response: AssessResponse; client: WordClientTimings }> {
    return this.enqueue(async () => {
      const tConn0 = Date.now();
      const ws = await this.connect();
      const wasWarm = ws.readyState === WebSocket.OPEN && Date.now() - tConn0 < 5;
      const connect_ms = Date.now() - tConn0;

      const tRead0 = Date.now();
      const bytes = await readUriAsArrayBuffer(uri);
      const bytes_read_ms = Date.now() - tRead0;

      return await new Promise<{ response: AssessResponse; client: WordClientTimings }>((resolve, reject) => {
        let tSend = 0;
        let ws_send_ms = 0;

        const to = setTimeout(() => {
          this.closeSocket();
          reject(new Error("WS-Request-Timeout"));
        }, REQUEST_TIMEOUT_MS);

        const onMsg = (ev: MessageEvent) => {
          try {
            const data = JSON.parse(String(ev.data));
            if (data?.ping) return;                 // keep-alive -> ignore
            if (data?.error) {
              cleanup();
              reject(new Error(String(data.error)));
              return;
            }
            const rtt_ms = Date.now() - tSend;
            cleanup();
            const serverMs = typeof data?.duration_ms === "number" ? data.duration_ms : -1;
            const net_ms = rtt_ms - serverMs;
            // eslint-disable-next-line no-console
            console.log(
              "[WORD]",
              `warm=${wasWarm ? "y" : "n"}`,
              `connect=${connect_ms}ms`,
              `bytes=${bytes.byteLength}`,
              `read=${bytes_read_ms}ms`,
              `send=${ws_send_ms}ms`,
              `rtt=${rtt_ms}ms`,
              `server=${serverMs}ms`,
              `net_only=${net_ms >= 0 ? net_ms + "ms" : "?"}`,
            );
            useDebug.getState().push("ws_word",
              `RTT ${rtt_ms}ms (Server ${serverMs}ms, Netz ${net_ms}ms)`,
              { warm: wasWarm ? 1 : 0, connect_ms, read_ms: bytes_read_ms, send_ms: ws_send_ms, rtt_ms, server_ms: serverMs });
            const client: WordClientTimings = {
              connect_ms,
              bytes_read_ms,
              ws_send_ms,
              rtt_ms,
              bytes: bytes.byteLength,
              warm: wasWarm,
            };
            resolve({ response: data as AssessResponse, client });
          } catch (e: any) {
            cleanup();
            reject(new Error(`JSON-Parse: ${e?.message ?? e}`));
          }
        };
        const onErr = () => {
          cleanup();
          this.closeSocket();
          reject(new Error("WS-Error während Request"));
        };
        const onClose = () => {
          cleanup();
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
          const tSendStart = Date.now();
          ws.send(JSON.stringify({ target }));
          ws.send(bytes);
          tSend = Date.now();
          ws_send_ms = tSend - tSendStart;
        } catch (e: any) {
          cleanup();
          this.closeSocket();
          reject(new Error(`WS-Send-Fehler: ${e?.message ?? e}`));
        }
      });
    });
  }

  /**
   * Sendet die ganze Ayah-Audio und ruft `onProgress` für JEDES eingehende
   * Server-Frame (start / word / done). Aufloest mit dem Done-Event UND
   * einer Client-Timing-Aufschluesselung fuer Diagnose. Fehler -> reject,
   * Aufrufer zeigt einen Fehlerzustand an.
   */
  assessAyah(
    uri: string,
    ayahText: string,
    onProgress: (ev: AyahProgress) => void,
  ): Promise<{ done: AyahDoneEvent; client: AyahClientTimings }> {
    return this.enqueue(async () => {
      useDebug.getState().push("ws_ayah_start", `Ayah senden (${ayahText.slice(0, 30)}…)`);
      const ws = await this.connect();

      const tRead0 = Date.now();
      const bytes = await readUriAsArrayBuffer(uri);
      const bytes_read_ms = Date.now() - tRead0;

      return await new Promise<{ done: AyahDoneEvent; client: AyahClientTimings }>((resolve, reject) => {
        let ws_send_ms = 0;
        let tSend = 0;
        let first_frame_ms = 0;

        const to = setTimeout(() => {
          this.closeSocket();
          reject(new Error("WS-Ayah-Timeout"));
        }, AYAH_TIMEOUT_MS);

        const onMsg = (ev: MessageEvent) => {
          try {
            const data = JSON.parse(String(ev.data));
            if (data?.ping) return;
            if (data?.error) {
              cleanup();
              useDebug.getState().push("ws_error", `Server-Error: ${data.error}`);
              reject(new Error(String(data.error)));
              return;
            }
            if (!first_frame_ms && (data?.kind === "start" || data?.kind === "word" || data?.kind === "done")) {
              first_frame_ms = Date.now() - tSend;
              useDebug.getState().push("ws_ayah_first",
                `Erstes Frame nach ${first_frame_ms}ms`,
                { kind: data.kind });
            }
            if (data?.kind === "start" || data?.kind === "word") {
              onProgress(data as AyahProgress);
              return;
            }
            if (data?.kind === "done") {
              onProgress(data as AyahProgress);
              const last_frame_ms = Date.now() - tSend;
              cleanup();
              const client: AyahClientTimings = {
                bytes_read_ms,
                ws_send_ms,
                first_frame_ms,
                last_frame_ms,
                bytes: bytes.byteLength,
              };
              const done = data as AyahDoneEvent;
              // Struktur-Log fuer Metro-Terminal
              // eslint-disable-next-line no-console
              console.log(
                "[AYAH]",
                `bytes=${client.bytes}`,
                `read=${bytes_read_ms}ms`,
                `send=${ws_send_ms}ms`,
                `first=${first_frame_ms}ms`,
                `last=${last_frame_ms}ms`,
                `server_total=${done.duration_ms}ms`,
                done.timings ? `pre=${done.timings.preprocess_ms}ms asr=${done.timings.asr_ms}ms align=${done.timings.align_ms}ms score=${done.timings.score_ms}ms audio_ms=${done.timings.audio_ms}` : "",
              );
              useDebug.getState().push("ws_ayah_done",
                `done ${last_frame_ms}ms (Server ${done.duration_ms}ms)`,
                {
                  bytes: client.bytes,
                  read_ms: bytes_read_ms,
                  first_ms: first_frame_ms,
                  last_ms: last_frame_ms,
                  server_ms: done.duration_ms,
                  asr_ms: done.timings?.asr_ms ?? null,
                  audio_ms: done.timings?.audio_ms ?? null,
                });
              resolve({ done, client });
              return;
            }
          } catch (e: any) {
            cleanup();
            reject(new Error(`JSON-Parse: ${e?.message ?? e}`));
          }
        };
        const onErr = () => {
          cleanup();
          this.closeSocket();
          reject(new Error("WS-Error während Ayah-Request"));
        };
        const onClose = () => {
          cleanup();
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
          const tSendStart = Date.now();
          ws.send(JSON.stringify({ mode: "ayah", ayah: ayahText }));
          ws.send(bytes);
          tSend = Date.now();
          ws_send_ms = tSend - tSendStart;
        } catch (e: any) {
          cleanup();
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

// Singleton-Cache pro (URL, Token). Wechsel eines der beiden => Session neu.
let cached: { url: string; token: string; session: StreamSession } | null = null;

export function getStreamSession(backendUrl: string, token: string = ""): StreamSession {
  if (!cached || cached.url !== backendUrl || cached.token !== token) {
    cached?.session.dispose();
    cached = { url: backendUrl, token, session: new StreamSession(backendUrl, token) };
  }
  return cached.session;
}

/** Schliesst und verwirft die Singleton-Session (z.B. bei URL-Wechsel im Settings). */
export function closeStreamSession(): void {
  cached?.session.dispose();
  cached = null;
}

export { StreamSession };
