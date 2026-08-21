import { View, Text, StyleSheet } from "react-native";
import type { AssessMeta } from "@/lib/api";
import { useTheme } from "@/store/useTheme";

/**
 * Live-Diagnose-Chip unter dem Ergebnis.
 *
 * Die aussagekraeftige Zahl bei LiveKit ist "Antwort": vom VAD-Ende (Kind hat
 * aufgehoert) bis zum Ergebnis-Frame — genau das, was das Kind als Wartezeit
 * erlebt. `totalMs` ist absichtlich nicht die Hauptzahl, denn darin steckt die
 * Sprechzeit des Kindes.
 *
 * Antwort >> Server  -> Zeit liegt im Netz (WebRTC/Handy).
 * Server  >> 300 ms  -> Zeit liegt im Backend (kalter Container).
 * Bereit  >> 2000 ms -> Modal-Kaltstart, nicht der Uebertragungsweg.
 */
export function LatencyChip({
  meta,
  serverMs,
}: {
  meta?: AssessMeta;
  serverMs?: number;
}) {
  const c = useTheme();
  if (!meta) return null;

  const t = meta.turn;
  // Antwortzeit inkl. Stream-Ende: bei Ayah trudeln die Wort-Frames nach.
  const answerMs = t.score_ms + t.stream_ms;
  const netMs = serverMs !== undefined ? Math.max(0, answerMs - serverMs) : undefined;
  const netColor =
    netMs === undefined ? c.text : netMs > 500 ? c.bad.text : netMs > 200 ? c.medium.text : c.good.text;
  const answerColor = answerMs > 1500 ? c.bad.text : answerMs > 800 ? c.medium.text : c.good.text;

  return (
    <View style={[styles.wrap, { backgroundColor: c.surfaceMuted, borderColor: c.border }]}>
      <Text style={[styles.txt, { color: c.text }]}>🎙️ LiveKit{t.warm ? "" : " (neu verbunden)"}</Text>
      <Text style={[styles.sep, { color: c.textMuted }]}>·</Text>
      <Text style={[styles.txt, { color: answerColor }]}>Antwort {answerMs} ms</Text>
      <Text style={[styles.sep, { color: c.textMuted }]}>·</Text>
      <Text style={[styles.txt, { color: c.text }]}>Server {serverMs ?? "?"} ms</Text>
      {netMs !== undefined && (
        <>
          <Text style={[styles.sep, { color: c.textMuted }]}>·</Text>
          <Text style={[styles.txt, { color: netColor }]}>Netz {netMs} ms</Text>
        </>
      )}
      {t.ready_ms > 2000 && (
        <>
          <Text style={[styles.sep, { color: c.textMuted }]}>·</Text>
          <Text style={[styles.txt, { color: c.medium.text }]}>Kaltstart {t.ready_ms} ms</Text>
        </>
      )}
      <Text style={[styles.sep, { color: c.textMuted }]}>·</Text>
      <Text style={[styles.txt, { color: c.textMuted }]}>Runde {meta.totalMs} ms</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  txt: { fontSize: 11, fontWeight: "600" },
  sep: { fontSize: 11 },
});
