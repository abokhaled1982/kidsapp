import { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useDebug, type DebugEvent, type DebugKind, type LinkState } from "@/store/useDebug";

// Kompakter Debug-Chip am Bildschirmrand. Zeigt: Verbindung + letzter Event.
// Antippen -> Vollbild-Log mit allen Events der Session.

const KIND_COLOR: Partial<Record<DebugKind, string>> = {
  lk_connect:     "#22d3ee",
  lk_reconnect:   "#fbbf24",
  lk_close:       "#f97316",
  lk_ready:       "#38bdf8",
  lk_scoring:     "#a78bfa",
  lk_word:        "#4ade80",
  lk_ayah_start:  "#38bdf8",
  lk_ayah_done:   "#4ade80",
  lk_error:       "#f87171",
  rec_start:      "#94a3b8",
  rec_stop:       "#94a3b8",
  note:           "#e2e8f0",
};

// Der Punkt zeigt den Room-Zustand, nicht den letzten Event: bei LiveKit ist
// "steht die Verbindung noch?" die Frage, die man im Feld beantworten muss.
const LINK_COLOR: Record<LinkState, string> = {
  unknown:      "#64748b",
  connected:    "#22d3ee",
  reconnecting: "#fbbf24",
  down:         "#f87171",
};

function fmtTime(ms: number) {
  const d = new Date(ms);
  return d.toLocaleTimeString(undefined, { hour12: false });
}

export function DebugOverlay() {
  const events = useDebug((s) => s.events);
  const lastMode = useDebug((s) => s.lastMode);
  const link = useDebug((s) => s.link);
  const clear = useDebug((s) => s.clear);
  const [open, setOpen] = useState(false);
  const last = events[0];

  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={styles.bar}>
        <View style={[styles.dot, { backgroundColor: LINK_COLOR[link] }]} />
        <Text style={styles.mode}>{lastMode.toUpperCase()}</Text>
        <Text style={styles.msg} numberOfLines={1}>
          {last ? `${fmtTime(last.ts)}  ${last.kind}  ${last.msg}` : "kein Event bisher"}
        </Text>
        <Ionicons name="chevron-up" size={16} color="#94a3b8" />
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalRoot}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Debug-Log · {events.length} Events</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable onPress={clear} style={styles.iconBtn}>
                <Ionicons name="trash" size={18} color="#e2e8f0" />
              </Pressable>
              <Pressable onPress={() => setOpen(false)} style={styles.iconBtn}>
                <Ionicons name="close" size={18} color="#e2e8f0" />
              </Pressable>
            </View>
          </View>
          <ScrollView contentContainerStyle={styles.list}>
            {events.length === 0 ? (
              <Text style={styles.empty}>
                Noch keine Events. Eine Runde sprechen, dann kommen hier alle Timings rein.
              </Text>
            ) : (
              events.map((e) => <EventRow key={e.id} ev={e} />)
            )}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

function EventRow({ ev }: { ev: DebugEvent }) {
  const color = KIND_COLOR[ev.kind] ?? "#cbd5e1";
  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <View style={[styles.dotSm, { backgroundColor: color }]} />
        <Text style={styles.rowTime}>{fmtTime(ev.ts)}</Text>
        <Text style={[styles.rowKind, { color }]}>{ev.kind}</Text>
      </View>
      <Text style={styles.rowMsg}>{ev.msg}</Text>
      {ev.data && Object.keys(ev.data).length > 0 && (
        <View style={styles.rowData}>
          {Object.entries(ev.data).map(([k, v]) => (
            <View style={styles.kv} key={k}>
              <Text style={styles.kvK}>{k}</Text>
              <Text style={styles.kvV}>{String(v ?? "—")}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#0f172a",
    borderTopWidth: 1,
    borderTopColor: "#1e293b",
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  mode: { color: "#93c5fd", fontWeight: "800", fontSize: 11, letterSpacing: 1 },
  msg: { flex: 1, color: "#e2e8f0", fontSize: 11, fontFamily: "monospace" },

  modalRoot: { flex: 1, backgroundColor: "#0b1220" },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
    paddingTop: 48,
  },
  modalTitle: { color: "#f1f5f9", fontWeight: "800", fontSize: 15 },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "#1e293b",
    alignItems: "center", justifyContent: "center",
  },
  list: { padding: 12, gap: 8 },
  empty: { color: "#64748b", textAlign: "center", padding: 40, fontStyle: "italic" },

  row: {
    backgroundColor: "#0f172a",
    borderWidth: 1, borderColor: "#1e293b",
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
  rowHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  dotSm: { width: 8, height: 8, borderRadius: 4 },
  rowTime: { color: "#94a3b8", fontSize: 11, fontFamily: "monospace" },
  rowKind: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  rowMsg: { color: "#e2e8f0", fontSize: 12, fontFamily: "monospace" },
  rowData: { marginTop: 4, gap: 2 },
  kv: { flexDirection: "row", justifyContent: "space-between" },
  kvK: { color: "#94a3b8", fontSize: 11, fontFamily: "monospace" },
  kvV: { color: "#f1f5f9", fontSize: 11, fontFamily: "monospace", fontWeight: "700" },
});
