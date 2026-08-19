import { ActivityIndicator, View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { CATEGORIES } from "@/data/categories";
import { WORDS } from "@/data/words";
import { CategoryCard } from "@/components/CategoryCard";
import { useProgress, level } from "@/store/useProgress";
import { useProfile } from "@/store/useProfile";
import { initialProfileScreen } from "@/store/profileFlow";
import OnboardingScreen from "../onboarding";

export default function AussprachHome() {
  const router = useRouter();
  const profile = useProfile((s) => s.profile);
  const hasHydrated = useProfile((s) => s.hasHydrated);
  const xp = useProgress((s) => s.xp);
  const stars = useProgress((s) => s.stars);
  const mastered = useProgress((s) => s.wordsMastered);
  const lv = level(xp);

  const screen = initialProfileScreen(hasHydrated, profile);

  if (screen === "loading") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f8fafc" }}>
        <ActivityIndicator color="#2474d2" />
      </View>
    );
  }

  if (screen === "onboarding" || !profile) {
    return <OnboardingScreen onComplete={() => undefined} />;
  }

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.hello}>Salām, {profile.name} 👋</Text>
          <Text style={styles.sub}>{profile.level}. Lernlevel · Lass uns Arabisch lernen!</Text>
        </View>
        <Pressable onPress={() => router.push("/settings" as any)} style={styles.gearBtn}>
          <Ionicons name="settings-outline" size={22} color="#334155" />
        </Pressable>
      </View>

      <View style={styles.levelCard}>
        <Text style={styles.levelLabel}>Dein Level</Text>
        <View style={styles.levelRow}>
          <Text style={styles.levelValue}>Lvl {lv}</Text>
          <View style={styles.stats}>
            <Stat label="XP" value={xp} />
            <Stat label="Sterne" value={stars} />
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.sectionTitle}>Kategorien</Text>
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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ alignItems: "flex-end" }}>
      <Text style={{ color: "white", fontSize: 20, fontWeight: "700" }}>{value}</Text>
      <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 12 }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f8fafc" },
  headerRow: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  hello: { fontSize: 24, fontWeight: "700", color: "#0f172a" },
  sub: { color: "#64748b", marginTop: 2 },
  gearBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
  },
  levelCard: {
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 16,
    borderRadius: 22,
    backgroundColor: "#3b82f6",
  },
  levelLabel: { color: "rgba(255,255,255,0.9)", fontSize: 13 },
  levelRow: {
    marginTop: 4,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  levelValue: { color: "white", fontSize: 32, fontWeight: "800" },
  stats: { flexDirection: "row", gap: 16 },
  scroll: { padding: 20, paddingTop: 4, gap: 12 },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: "#0f172a", marginBottom: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  gridItem: { width: "47%" },
});
