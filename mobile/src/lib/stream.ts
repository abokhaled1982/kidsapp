import type { AssessResponse } from "./api";

// Persistente WebSocket-Session zum FastAPI-Endpoint /stream.
// Wiederverwendet eine Verbindung fuer viele Woerter -> eliminiert HTTPS/TLS-Overhead
// pro Wort (~500ms Ersparnis bei Cloudflared-Free-Tunnel).
export class StreamSession {
  private ws: WebSocket | null = null;
  private connectPromise: Promise<void> | null = null;
  private pending: {
    resolve: (r: AssessResponse) => void;
    reject: (e: Error) => void;
  } | null = null;

  constructor(private backendUrl: string) {}

  private wsUrl(): string {
    const base = this.backendUrl.replace(/\/$/, "");
    const scheme = base.startsWith("https") ? "wss" : "ws";
    return base.replace(/^https?/, scheme) + "/stream";
  }

  async ensureConnected(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    if (this.connectPromise) return this.connectPromise;
    const url = this.wsUrl();
    this.connectPromise = new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      // Cloudflared Cold-Start + WS-Upgrade kann laenger dauern als HTTPS.
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error(`WebSocket-Timeout nach 12s zu ${url}`));
      }, 12000);
      ws.onopen = () => {
        clearTimeout(timeout);
        console.log("[WS] connected", url);
        resolve();
      };
      ws.onerror = (e: any) => {
        clearTimeout(timeout);
        const msg = e?.message || "unbekannt";
        console.warn("[WS] error", url, msg);
        reject(new Error(`WebSocket-Verbindungsfehler: ${msg}`));
      };
      ws.onclose = (e: any) => {
        this.ws = null;
        this.connectPromise = null;
        if (e?.code) console.log("[WS] closed code=", e.code, "reason=", e.reason);
        if (this.pending) {
          this.pending.reject(new Error(`Verbindung getrennt (code ${e?.code ?? "?"})`));
          this.pending = null;
        }
      };
      ws.onmessage = (ev) => {
        // Keep-Alive-Pings vom Server ignorieren (halten Cloudflared-Tunnel offen).
        let data: any;
        try { data = JSON.parse(String(ev.data)); }
        catch { return; }
        if (data?.ping) return;
        if (!this.pending) return;
        const p = this.pending;
        this.pending = null;
        if (data.error) p.reject(new Error(data.error));
        else p.resolve(data as AssessResponse);
      };
    });
    try { await this.connectPromise; }
    finally { this.connectPromise = null; }
  }

  async assess(audioUri: string, target: string): Promise<AssessResponse> {
    // Bis zu 2 Versuche: einmal mit ggf. schon offener WS, einmal frisch verbunden.
    let lastErr: any = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await this.ensureConnected();
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          throw new Error("WS nicht offen");
        }
        if (this.pending) throw new Error("Vorherige Bewertung noch aktiv");

        const blob = await (await fetch(audioUri)).blob();
        const buffer = await blob.arrayBuffer();

        return await new Promise<AssessResponse>((resolve, reject) => {
          this.pending = { resolve, reject };
          try {
            this.ws!.send(JSON.stringify({ target }));
            this.ws!.send(buffer);
          } catch (e: any) {
            this.pending = null;
            reject(new Error(e?.message ?? "Sendefehler"));
            return;
          }
          setTimeout(() => {
            if (this.pending?.resolve === resolve) {
              this.pending = null;
              reject(new Error("Server-Timeout (30s)"));
            }
          }, 30000);
        });
      } catch (e: any) {
        lastErr = e;
        console.warn(`[WS] assess attempt ${attempt + 1} failed:`, e?.message);
        // Session komplett schliessen, damit ensureConnected() beim naechsten Versuch neu aufbaut.
        this.close();
      }
    }
    throw lastErr ?? new Error("Unbekannter WS-Fehler");
  }

  close() {
    this.ws?.close();
    this.ws = null;
    this.connectPromise = null;
    this.pending = null;
  }
}

// Modul-Singleton: eine offene Session pro Backend-URL.
// Wird bei URL-Wechsel automatisch neu aufgebaut.
let _session: StreamSession | null = null;
let _lastUrl = "";

export function getStreamSession(backendUrl: string): StreamSession {
  if (_session && _lastUrl === backendUrl) return _session;
  _session?.close();
  _session = new StreamSession(backendUrl);
  _lastUrl = backendUrl;
  return _session;
}

export function closeStreamSession() {
  _session?.close();
  _session = null;
  _lastUrl = "";
}
