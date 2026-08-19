import { View, Text, StyleSheet } from "react-native";
import type { AssessMeta } from "@/lib/api";
import { useTheme } from "@/store/useTheme";

/**
 * Live-Diagnose-Chip unter dem Ergebnis: zeigt Uebertragungs-Modus,
 * Server-Zeit (reine GPU+Preprocessing), und Client-Gesamtzeit (inkl. Netz).
 * Wenn total >> server, liegt die Zeit im Netzwerk (Cloudflared/Handy).
 * Wenn server >> 300ms, liegt sie im Backend (kalte GPU / geteilte T4).
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
  const modeLabel = "⚡ WebSocket";
  const netMs = serverMs !== undefined ? Math.max(0, meta.totalMs - serverMs) : undefined;
  const netColor =
    netMs === undefined ? c.text : netMs > 500 ? c.bad.text : netMs > 200 ? c.medium.text : c.good.text;
  return (
    <View style={[styles.wrap, { backgroundColor: c.surfaceMuted, borderColor: c.border }]}>
      <Text style={[styles.txt, { color: c.text }]}>{modeLabel}</Text>
      <Text style={[styles.sep, { color: c.textMuted }]}>·</Text>
      <Text style={[styles.txt, { color: c.text }]}>Server {serverMs ?? "?"} ms</Text>
      {netMs !== undefined && (
        <>
          <Text style={[styles.sep, { color: c.textMuted }]}>·</Text>
          <Text style={[styles.txt, { color: netColor }]}>Netz {netMs} ms</Text>
        </>
      )}
      <Text style={[styles.sep, { color: c.textMuted }]}>·</Text>
      <Text style={[styles.txt, { color: c.text }]}>Total {meta.totalMs} ms</Text>
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
