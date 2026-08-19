import { View, Text, StyleSheet } from "react-native";
import type { AssessUnit } from "@/lib/api";

function colorFor(score: number): string {
  if (score >= 75) return "#22c55e";
  if (score >= 50) return "#f59e0b";
  return "#ef4444";
}

export function LetterFeedback({ units }: { units: AssessUnit[] }) {
  if (!units?.length) return null;

  const hints = units
    .map((u, i) => ({ i, target: u.label, hint: u.error_hint }))
    .filter((h) => !!h.hint);

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {units.map((u, i) => {
          const color = colorFor(u.score);
          const hasHint = !!u.error_hint;
          return (
            <View
              key={`${u.label}-${i}`}
              style={[
                styles.chip,
                { borderColor: color, backgroundColor: hasHint ? "#fef2f2" : "#ffffff" },
              ]}
            >
              <Text style={[styles.letter, { color }]}>{u.label}</Text>
              {u.recognized && u.recognized !== u.label ? (
                <Text style={styles.recognized}>→ {u.recognized}</Text>
              ) : null}
              {hasHint ? (
                <View style={styles.hintBadge}>
                  <Text style={styles.hintBadgeText}>{u.error_hint}</Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      {hints.length > 0 && (
        <View style={styles.hintList}>
          {hints.map(({ i, target, hint }) => (
            <Text key={`${target}-${i}`} style={styles.hintLine}>
              Erwartet <Text style={styles.hintTarget}>{target}</Text>, erkannt{" "}
              <Text style={styles.hintWrong}>{hint}</Text>
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%", alignItems: "center" },
  row: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
    marginTop: 8,
  },
  chip: {
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#ffffff",
    position: "relative",
  },
  letter: { fontSize: 24, fontWeight: "700", writingDirection: "rtl" },
  recognized: { color: "#b91c1c", fontSize: 16, fontWeight: "800", writingDirection: "rtl" },
  hintBadge: {
    position: "absolute",
    top: -8,
    right: -8,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 5,
    borderRadius: 11,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "white",
  },
  hintBadgeText: {
    color: "white",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 14,
  },
  hintList: {
    marginTop: 12,
    gap: 4,
    alignItems: "center",
  },
  hintLine: { color: "#334155", fontSize: 15, textAlign: "center" },
  hintTarget: { color: "#22c55e", fontWeight: "800", fontSize: 18 },
  hintWrong: { color: "#ef4444", fontWeight: "800", fontSize: 18 },
});
