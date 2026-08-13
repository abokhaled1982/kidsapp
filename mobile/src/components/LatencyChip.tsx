import { View, Text, StyleSheet } from "react-native";
import type { AssessMeta } from "@/lib/api";

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
  if (!meta) return null;
  const modeLabel =
    meta.mode === "ws" ? "⚡ WebSocket" :
    meta.mode === "http-fallback" ? "↩︎ HTTP-Fallback" :
    "🐢 HTTP";
  const netMs = serverMs !== undefined ? Math.max(0, meta.totalMs - serverMs) : undefined;
  return (
    <View style={styles.wrap}>
      <Text style={styles.txt}>{modeLabel}</Text>
      <Text style={styles.sep}>·</Text>
      <Text style={styles.txt}>Server {serverMs ?? "?"} ms</Text>
      {netMs !== undefined && (
        <>
          <Text style={styles.sep}>·</Text>
          <Text style={[styles.txt, netMs > 500 ? styles.bad : netMs > 200 ? styles.warn : styles.ok]}>
            Netz {netMs} ms
          </Text>
        </>
      )}
      <Text style={styles.sep}>·</Text>
      <Text style={styles.txt}>Total {meta.totalMs} ms</Text>
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
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    flexWrap: "wrap",
    justifyContent: "center",
  },
  txt: { color: "#334155", fontSize: 11, fontWeight: "600" },
  sep: { color: "#94a3b8", fontSize: 11 },
  ok:   { color: "#16a34a" },
  warn: { color: "#eab308" },
  bad:  { color: "#dc2626" },
});
