// Debug-Log fuer die App-UI. Sammelt die letzten N Client-Events und
// exponiert sie an ein Overlay im Quran-Screen. Kein Metro-Terminal noetig.
//
// Events werden von stream.ts und dem Quran-Screen selbst geschrieben.
// HTTP-Events existieren nicht mehr (HTTP-Pfad wurde entfernt).

import { create } from "zustand";

export type DebugKind =
  | "ws_open"
  | "ws_ayah_start"
  | "ws_ayah_first"
  | "ws_ayah_done"
  | "ws_word"
  | "ws_error"
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

type State = {
  events: DebugEvent[];
  lastMode: "ws" | "unknown";
  wsOk: number;
  wsErr: number;
  lastError: string | null;
  push: (kind: DebugKind, msg: string, data?: DebugEvent["data"]) => void;
  clear: () => void;
};

const MAX = 30;

export const useDebug = create<State>((set) => ({
  events: [],
  lastMode: "unknown",
  wsOk: 0, wsErr: 0,
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
      let lastMode = s.lastMode;
      if (kind.startsWith("ws_")) lastMode = "ws";
      const wsOk   = s.wsOk   + (kind === "ws_ayah_done" ? 1 : 0);
      const wsErr  = s.wsErr  + (kind === "ws_error"     ? 1 : 0);
      const lastError = kind === "ws_error" ? msg : s.lastError;
      const next = [ev, ...s.events].slice(0, MAX);
      // eslint-disable-next-line no-console
      console.log(`[DBG ${kind}] ${msg}`, data ?? "");
      return { events: next, lastMode, wsOk, wsErr, lastError };
    }),
  clear: () => set({ events: [], lastMode: "unknown", wsOk:0, wsErr:0, lastError:null }),
}));
