// Debug-Log fuer die App-UI. Sammelt die letzten N Client-Events und
// exponiert sie an ein Overlay im Quran-Screen. Kein Metro-Terminal noetig.
//
// Events schreibt livekit-stream.ts (lk_*) und die Praxis-Screens selbst
// (rec_*, note). HTTP- und WebSocket-Pfade existieren nicht mehr.

import { create } from "zustand";

export type DebugKind =
  | "lk_connect"     // Room steht
  | "lk_reconnect"   // Verbindung wackelt
  | "lk_close"       // Room getrennt
  | "lk_ready"       // Agent hat das Zielwort bestaetigt
  | "lk_scoring"     // Agent hat Sprachende erkannt und rechnet
  | "lk_word"        // Wort-Ergebnis
  | "lk_ayah_start"  // Ayah abgeschickt
  | "lk_ayah_done"   // Ayah fertig bewertet
  | "lk_error"
  | "rec_start"
  | "rec_stop"
  | "note";

export type DebugEvent = {
  id: string;
  ts: number;        // Date.now()
  kind: DebugKind;
  msg: string;
  data?: Record<string, string | number | undefined | null>;
};

/** Verbindungszustand des Rooms. Der WS-Pfad kannte kein "reconnecting". */
export type LinkState = "unknown" | "connected" | "reconnecting" | "down";

type State = {
  events: DebugEvent[];
  lastMode: "livekit" | "unknown";
  link: LinkState;
  /** Erfolgreich bewertete Runden (Wort oder Ayah). */
  okCount: number;
  errCount: number;
  lastError: string | null;
  push: (kind: DebugKind, msg: string, data?: DebugEvent["data"]) => void;
  clear: () => void;
};

const MAX = 30;

const LINK_BY_KIND: Partial<Record<DebugKind, LinkState>> = {
  lk_connect: "connected",
  lk_reconnect: "reconnecting",
  lk_close: "down",
};

export const useDebug = create<State>((set) => ({
  events: [],
  lastMode: "unknown",
  link: "unknown",
  okCount: 0,
  errCount: 0,
  lastError: null,
  push: (kind, msg, data) =>
    set((s) => {
      const ev: DebugEvent = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        ts: Date.now(),
        kind,
        msg,
        data,
      };
      const lastMode = kind.startsWith("lk_") ? "livekit" : s.lastMode;
      const link = LINK_BY_KIND[kind] ?? s.link;
      const scored = kind === "lk_word" || kind === "lk_ayah_done";
      const okCount = s.okCount + (scored ? 1 : 0);
      const errCount = s.errCount + (kind === "lk_error" ? 1 : 0);
      const lastError = kind === "lk_error" ? msg : s.lastError;
      const next = [ev, ...s.events].slice(0, MAX);
      // eslint-disable-next-line no-console
      console.log(`[DBG ${kind}] ${msg}`, data ?? "");
      return { events: next, lastMode, link, okCount, errCount, lastError };
    }),
  clear: () =>
    set({
      events: [],
      lastMode: "unknown",
      link: "unknown",
      okCount: 0,
      errCount: 0,
      lastError: null,
    }),
}));
