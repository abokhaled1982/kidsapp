// Prominenter Status-Chip fuer den Quran-Screen. Beantwortet die eine Frage:
// "Läuft die WebSocket-Verbindung sauber?" HTTP ist vollständig entfernt.

import { View, Text, StyleSheet, Platform } from "react-native";
import { useDebug } from "@/store/useDebug";
import { useTheme } from "@/store/useTheme";

export function NetworkStatusBadge() {
  const c = useTheme();
  const lastMode  = useDebug((s) => s.lastMode);
  const wsOk      = useDebug((s) => s.wsOk);
  const wsErr     = useDebug((s) => s.wsErr);
  const lastError = useDebug((s) => s.lastError);

  // Der Chip nimmt den passenden Zustands-Ton aus dem Theme:
  // ruhig = pending, aktiv = scanning, Fehler = bad.
  let tone = c.pending;
  let title = "Bereit";
  let subtitle = "WebSocket wird bei der nächsten Aufnahme genutzt";

  if (lastMode === "ws") {
    tone = c.scanning;
    title = "✅ WebSocket AKTIV";
    subtitle = `${wsOk} erfolgreich${wsErr ? ` · ${wsErr} Fehler` : ""}`;
  } else if (wsErr > 0) {
    tone = c.bad;
    title = "⚠️ WebSocket-Fehler";
    subtitle = `${wsErr} Fehler bisher · letzter unten`;
  }

  return (
    <View style={[styles.wrap, { backgroundColor: tone.bg, borderColor: tone.border }]}>
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: tone.base }]} />
        <Text style={[styles.title, { color: tone.text }]}>{title}</Text>
      </View>
      <Text style={[styles.sub, { color: tone.text }]}>{subtitle}</Text>
      {(wsOk + wsErr) > 0 && (
        <View style={styles.counts}>
          <Text style={[styles.count, { color: c.textMuted }]}>
            WS: <Text style={[styles.countStrong, { color: c.good.text }]}>{wsOk}</Text>
            {wsErr > 0 && (
              <Text style={[styles.countStrong, { color: c.bad.text }]}> / {wsErr} ⚠</Text>
            )}
          </Text>
        </View>
      )}
      {lastError && (
        <Text style={[styles.err, { color: c.bad.text }]}>Letzter Fehler: {lastError}</Text>
      )}
    </View>
  );
}

const MONO = Platform.OS === "ios" ? "Menlo" : "monospace";

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
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
  count: { fontSize: 11, fontFamily: MONO },
  countStrong: { fontWeight: "800" },
  err: { fontSize: 10, marginTop: 6, fontFamily: MONO },
});
