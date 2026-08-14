// Prominenter Status-Chip fuer den Quran-Screen. Beantwortet die eine Frage:
// "Läuft die WebSocket-Verbindung sauber?" HTTP ist vollständig entfernt.

import { View, Text, StyleSheet } from "react-native";
import { useDebug } from "@/store/useDebug";

export function NetworkStatusBadge() {
  const lastMode  = useDebug((s) => s.lastMode);
  const wsOk      = useDebug((s) => s.wsOk);
  const wsErr     = useDebug((s) => s.wsErr);
  const lastError = useDebug((s) => s.lastError);

  let bg = "#e2e8f0"; let fg = "#334155"; let dot = "#94a3b8"; let title = "Bereit";
  let subtitle = "WebSocket wird bei der nächsten Aufnahme genutzt";

  if (lastMode === "ws") {
    bg = "#ecfeff"; fg = "#0e7490"; dot = "#06b6d4";
    title = "✅ WebSocket AKTIV";
    subtitle = `${wsOk} erfolgreich${wsErr ? ` · ${wsErr} Fehler` : ""}`;
  } else if (wsErr > 0) {
    bg = "#fef2f2"; fg = "#991b1b"; dot = "#ef4444";
    title = "⚠️ WebSocket-Fehler";
    subtitle = `${wsErr} Fehler bisher · letzter unten`;
  }

  return (
    <View style={[styles.wrap, { backgroundColor: bg }]}>
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: dot }]} />
        <Text style={[styles.title, { color: fg }]}>{title}</Text>
      </View>
      <Text style={[styles.sub, { color: fg }]}>{subtitle}</Text>
      {(wsOk + wsErr) > 0 && (
        <View style={styles.counts}>
          <Text style={styles.count}>WS: <Text style={styles.countOk}>{wsOk}</Text>{wsErr > 0 && <Text style={styles.countErr}> / {wsErr} ⚠</Text>}</Text>
        </View>
      )}
      {lastError && (
        <Text style={styles.err}>Letzter Fehler: {lastError}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  title: { fontSize: 13, fontWeight: "800", letterSpacing: 0.3 },
  sub: { fontSize: 11, marginTop: 2, opacity: 0.85 },
  counts: {
    flexDirection: "row",
    gap: 12,
    marginTop: 6,
  },
  count: { fontSize: 11, color: "#475569", fontFamily: "monospace" },
  countOk: { color: "#16a34a", fontWeight: "800" },
  countErr: { color: "#dc2626", fontWeight: "800" },
  err: { fontSize: 10, color: "#7f1d1d", marginTop: 6, fontFamily: "monospace" },
});
