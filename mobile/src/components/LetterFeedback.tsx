import { View, Text, StyleSheet } from "react-native";
import type { AssessUnit } from "@/lib/api";

function colorFor(score: number): string {
  if (score >= 0.75) return "#22c55e";
  if (score >= 0.5) return "#f59e0b";
  return "#ef4444";
}

export function LetterFeedback({ units }: { units: AssessUnit[] }) {
  if (!units?.length) return null;
  return (
    <View style={styles.row}>
      {units.map((u, i) => (
        <View key={`${u.label}-${i}`} style={[styles.chip, { borderColor: colorFor(u.score) }]}>
          <Text style={[styles.letter, { color: colorFor(u.score) }]}>{u.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 6,
    justifyContent: "center",
    marginTop: 8,
  },
  chip: {
    borderWidth: 2,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#ffffff",
  },
  letter: { fontSize: 22, fontWeight: "700" },
});
