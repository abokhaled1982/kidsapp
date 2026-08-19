import { View, Text, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useProgress, level, xpForNextLevel } from "@/store/useProgress";
import { useTheme } from "@/store/useTheme";
import type { ThemePalette } from "@/store/profileModel";

export default function RewardsScreen() {
  const c = useTheme();
  const xp = useProgress((s) => s.xp);
  const stars = useProgress((s) => s.stars);
  const streak = useProgress((s) => s.streakDays);
  const mastered = useProgress((s) => s.wordsMastered);
  const lv = level(xp);
  const nextXp = xpForNextLevel(xp);
  const wordsCount = Object.keys(mastered).length;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.title, { color: c.text }]}>Meine Sterne</Text>

        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={[styles.big, { color: c.text }]}>{stars} ⭐</Text>
          <Text style={[styles.label, { color: c.textMuted }]}>Gesamt Sterne</Text>
        </View>

        <View style={styles.row}>
          <Stat value={`Lvl ${lv}`} label="Level" colors={c} />
          <Stat value={xp} label="XP" colors={c} />
          <Stat value={`${streak}🔥`} label="Streak" colors={c} />
        </View>

        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={[styles.small, { color: c.textMuted }]}>Nächstes Level bei {nextXp} XP</Text>
          <View style={[styles.barBg, { backgroundColor: c.surfaceMuted }]}>
            <View
              style={[
                styles.barFill,
                { backgroundColor: c.primary, width: `${Math.min(100, (xp / nextXp) * 100)}%` },
              ]}
            />
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={[styles.small, { color: c.textMuted }]}>Gelernte Wörter</Text>
          <Text style={[styles.big, { color: c.text }]}>{wordsCount}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ value, label, colors }: { value: string | number; label: string; colors: ThemePalette }) {
  return (
    <View style={[styles.card, styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.big, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { padding: 20, gap: 12 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 6 },
  card: { borderRadius: 18, borderWidth: 1, gap: 4, padding: 16 },
  statCard: { alignItems: "center", flex: 1 },
  row: { flexDirection: "row", gap: 12 },
  big: { fontSize: 28, fontWeight: "800" },
  small: { fontSize: 13 },
  label: { fontSize: 12 },
  barBg: { borderRadius: 4, height: 8, marginTop: 8, overflow: "hidden" },
  barFill: { height: "100%" },
});
