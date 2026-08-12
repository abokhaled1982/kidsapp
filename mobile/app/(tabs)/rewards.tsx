import { View, Text, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useProgress, level, xpForNextLevel } from "@/store/useProgress";

export default function RewardsScreen() {
  const xp = useProgress((s) => s.xp);
  const stars = useProgress((s) => s.stars);
  const streak = useProgress((s) => s.streakDays);
  const mastered = useProgress((s) => s.wordsMastered);
  const lv = level(xp);
  const nextXp = xpForNextLevel(xp);
  const wordsCount = Object.keys(mastered).length;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Meine Sterne</Text>

        <View style={styles.card}>
          <Text style={styles.big}>{stars} ⭐</Text>
          <Text style={styles.label}>Gesamt Sterne</Text>
        </View>

        <View style={styles.row}>
          <Stat value={`Lvl ${lv}`} label="Level" />
          <Stat value={xp} label="XP" />
          <Stat value={`${streak}🔥`} label="Streak" />
        </View>

        <View style={styles.card}>
          <Text style={styles.small}>Nächstes Level bei {nextXp} XP</Text>
          <View style={styles.barBg}>
            <View style={[styles.barFill, { width: `${Math.min(100, (xp / nextXp) * 100)}%` }]} />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.small}>Gelernte Wörter</Text>
          <Text style={styles.big}>{wordsCount}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <View style={[styles.card, { flex: 1, alignItems: "center" }]}>
      <Text style={styles.big}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f8fafc" },
  scroll: { padding: 20, gap: 12 },
  title: { fontSize: 22, fontWeight: "700", color: "#0f172a", marginBottom: 6 },
  card: { backgroundColor: "white", padding: 16, borderRadius: 18, gap: 4 },
  row: { flexDirection: "row", gap: 12 },
  big: { fontSize: 28, fontWeight: "800", color: "#0f172a" },
  small: { fontSize: 13, color: "#64748b" },
  label: { fontSize: 12, color: "#64748b" },
  barBg: { height: 8, borderRadius: 4, backgroundColor: "#e2e8f0", marginTop: 8, overflow: "hidden" },
  barFill: { height: "100%", backgroundColor: "#3b82f6" },
});
