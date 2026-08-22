// Prominenter Status-Chip fuer den Quran-Screen. Beantwortet die eine Frage:
// "Steht die LiveKit-Verbindung?" HTTP und WebSocket sind vollständig entfernt.
//
// Anders als beim alten WS-Chip gibt es hier einen echten Verbindungszustand:
// LiveKit haelt den Room offen und meldet Reconnects, also wird das gezeigt,
// statt nur aus der letzten Bewertung zu raten.

import { View, Text, StyleSheet, Platform } from "react-native";
import { useDebug } from "@/store/useDebug";
import { useTheme } from "@/store/useTheme";

export function NetworkStatusBadge() {
  const c = useTheme();
  const link      = useDebug((s) => s.link);
  const okCount   = useDebug((s) => s.okCount);
  const errCount  = useDebug((s) => s.errCount);
  const lastError = useDebug((s) => s.lastError);

  // Der Chip nimmt den passenden Zustands-Ton aus dem Theme:
  // ruhig = pending, aktiv = scanning, Fehler = bad.
  let tone = c.pending;
  let title = "Bereit";
  let subtitle = "LiveKit verbindet bei der nächsten Runde";

  if (link === "connected") {
    tone = c.scanning;
    title = "✅ LiveKit VERBUNDEN";
    subtitle = okCount
      ? `${okCount} bewertet${errCount ? ` · ${errCount} Fehler` : ""}`
      : "Room steht · Agent wartet";
  } else if (link === "reconnecting") {
    tone = c.pending;
    title = "… LiveKit verbindet neu";
    subtitle = "Netz kurz weg — bitte einen Moment warten";
  } else if (link === "down") {
    tone = c.bad;
    title = "⚠️ LiveKit getrennt";
    subtitle = "Verbindung beendet · nächste Runde baut sie neu auf";
  } else if (errCount > 0) {
    tone = c.bad;
    title = "⚠️ LiveKit-Fehler";
    subtitle = `${errCount} Fehler bisher · letzter unten`;
  }

  return (
    <View style={[styles.wrap, { backgroundColor: tone.bg, borderColor: tone.border }]}>
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: tone.base }]} />
        <Text style={[styles.title, { color: tone.text }]}>{title}</Text>
      </View>
      <Text style={[styles.sub, { color: tone.text }]}>{subtitle}</Text>
      {(okCount + errCount) > 0 && (
        <View style={styles.counts}>
          <Text style={[styles.count, { color: c.textMuted }]}>
            LK: <Text style={[styles.countStrong, { color: c.good.text }]}>{okCount}</Text>
            {errCount > 0 && (
              <Text style={[styles.countStrong, { color: c.bad.text }]}> / {errCount} ⚠</Text>
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
