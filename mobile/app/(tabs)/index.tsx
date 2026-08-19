import { ActivityIndicator, View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { CATEGORIES } from "@/data/categories";
import { WORDS } from "@/data/words";
import { CategoryCard } from "@/components/CategoryCard";
import { useProgress, level } from "@/store/useProgress";
import { useProfile } from "@/store/useProfile";
import { useTheme } from "@/store/useTheme";
import { initialProfileScreen } from "@/store/profileFlow";
import OnboardingScreen from "../onboarding";

export default function AussprachHome() {
  const router = useRouter();
  const c = useTheme();
  const profile = useProfile((s) => s.profile);
  const hasHydrated = useProfile((s) => s.hasHydrated);
  const xp = useProgress((s) => s.xp);
  const stars = useProgress((s) => s.stars);
  const mastered = useProgress((s) => s.wordsMastered);
  const lv = level(xp);

  const screen = initialProfileScreen(hasHydrated, profile);

  if (screen === "loading") {
    return (
      <View style={[styles.loading, { backgroundColor: c.background }]}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  if (screen === "onboarding" || !profile) {
    return <OnboardingScreen onComplete={() => undefined} />;
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={["top"]}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={[styles.hello, { color: c.text }]}>Salām, {profile.name} 👋</Text>
          <Text style={[styles.sub, { color: c.textMuted }]}>
            {profile.level}. Lernlevel · Lass uns Arabisch lernen!
          </Text>
        </View>
        <Pressable
          onPress={() => router.push("/settings" as any)}
          style={[styles.gearBtn, { backgroundColor: c.surface, borderColor: c.border }]}
          accessibilityLabel="Einstellungen"
        >
          <Ionicons name="settings-outline" size={22} color={c.textMuted} />
        </Pressable>
      </View>

      <View style={[styles.levelCard, { backgroundColor: c.primary }]}>
        <Text style={[styles.levelLabel, { color: c.onPrimary }]}>Dein Level</Text>
        <View style={styles.levelRow}>
          <Text style={[styles.levelValue, { color: c.onPrimary }]}>Lvl {lv}</Text>
          <View style={styles.stats}>
            <Stat label="XP" value={xp} color={c.onPrimary} />
            <Stat label="Sterne" value={stars} color={c.onPrimary} />
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.sectionTitle, { color: c.text }]}>Kategorien</Text>
        <View style={styles.grid}>
          {CATEGORIES.map((cat) => {
            const items = WORDS[cat.id] ?? [];
            const done = items.filter((w) => (mastered[`${cat.id}:${w.ar}`] ?? 0) >= 75).length;
            const pct = items.length ? done / items.length : 0;
            return (
              <View key={cat.id} style={styles.gridItem}>
                <CategoryCard
                  category={cat}
                  progressPct={pct}
                  onPress={() => router.push(`/play/${cat.id}` as any)}
                />
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={[styles.statLabel, { color, opacity: 0.8 }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { alignItems: "center", flex: 1, justifyContent: "center" },
  root: { flex: 1 },
  headerRow: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  headerText: { flexShrink: 1 },
  hello: { fontSize: 24, fontWeight: "700" },
  sub: { marginTop: 2 },
  gearBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  levelCard: {
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 16,
    borderRadius: 22,
  },
  levelLabel: { fontSize: 13, opacity: 0.9 },
  levelRow: {
    marginTop: 4,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  levelValue: { fontSize: 32, fontWeight: "800" },
  stats: { flexDirection: "row", gap: 16 },
  stat: { alignItems: "flex-end" },
  statValue: { fontSize: 20, fontWeight: "700" },
  statLabel: { fontSize: 12 },
  scroll: { padding: 20, paddingTop: 4, gap: 12 },
  sectionTitle: { fontSize: 18, fontWeight: "700", marginBottom: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  gridItem: { width: "47%" },
});
