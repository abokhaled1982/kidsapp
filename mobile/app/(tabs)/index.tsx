// Startseite (Anforderungen 16: "genau eine klare naechste Aufgabe") und
// Anforderungen 8: grosse Flaechen, Bilder statt Textlisten.
//
// Was hier angezeigt wird, haengt am Level und damit am Alter: die Lernwelten
// kommen aus dem Levelplan, die sieben Wortkategorien erst ab Level 7. Ein
// Fuenfjaehriger sieht Buchstaben, Formen und Hoerpaare - keine Kategorien, die
// er noch nicht lesen kann.

import { ActivityIndicator, View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { WORDS } from "@/data/words";
import { drillWordForKey } from "@/data/wordSources";
import { CategoryCard } from "@/components/CategoryCard";
import { PictureTile } from "@/components/PictureTile";
import { useProgress, level } from "@/store/useProgress";
import { useProfile } from "@/store/useProfile";
import { useTheme } from "@/store/useTheme";
import { initialProfileScreen } from "@/store/profileFlow";
import {
  categoriesForLevel,
  drillRouteForItem,
  levelPlan,
  levelProgress,
  nextStep,
  worldsForLevel,
  MASTERY_SCORE,
} from "@/store/levelFlow";
import OnboardingScreen from "../onboarding";

export default function AussprachHome() {
  const router = useRouter();
  const c = useTheme();
  const profile = useProfile((s) => s.profile);
  const hasHydrated = useProfile((s) => s.hasHydrated);
  const xp = useProgress((s) => s.xp);
  const stars = useProgress((s) => s.stars);
  const mastered = useProgress((s) => s.wordsMastered);
  const heard = useProgress((s) => s.heard);
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

  const plan = levelPlan(profile.level);
  const snapshot = { mastered, heard };
  const progress = levelProgress(profile.level, snapshot);
  const step = nextStep(profile.level, snapshot);
  const worlds = worldsForLevel(profile.level, snapshot);
  const categories = categoriesForLevel(profile.level);
  const big = plan.ui.density === "large";

  // Der naechste Schritt fuehrt ins Sprechen, wenn das Sprachmodell den Inhalt
  // bewerten kann - sonst auf den Bildschirm des Lernpfads.
  const stepWord = step ? drillWordForKey(step.item.key) : null;
  const stepRoute = step ? (drillRouteForItem(step.item) ?? step.path.route) : null;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={["top"]}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={[styles.hello, { color: c.text }]}>Salām, {profile.name} 👋</Text>
          <Text style={[styles.sub, { color: c.textMuted }]}>
            {profile.level}. Lernlevel · {plan.summary}
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

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Groesstes Element: die eine naechste Aufgabe, direkt zum Sprechen. */}
        {step && stepRoute ? (
          <Pressable
            onPress={() => router.push(stepRoute as any)}
            accessibilityRole="button"
            accessibilityLabel={`Weiter üben: ${step.path.title}`}
            style={({ pressed }) => [
              styles.nextCard,
              { backgroundColor: c.primary },
              pressed && styles.pressed,
            ]}
          >
            <PictureTile
              pic={stepWord?.pic}
              fallback={step.path.emoji}
              size={big ? 116 : 96}
              tone="surface"
            />
            <View style={styles.nextBody}>
              <Text style={[styles.nextKicker, { color: c.onPrimary }]}>Jetzt dran</Text>
              <Text style={[styles.nextArabic, { color: c.onPrimary }]} numberOfLines={1}>
                {step.item.label}
              </Text>
              <Text style={[styles.nextHint, { color: c.onPrimary }]} numberOfLines={2}>
                {step.item.hint ?? step.path.title}
              </Text>
              <View style={[styles.nextGo, { backgroundColor: c.onPrimary }]}>
                <Ionicons
                  name={step.item.mode === "speak" ? "mic" : "play"}
                  size={18}
                  color={c.primary}
                />
                <Text style={[styles.nextGoText, { color: c.primary }]}>
                  {step.item.mode === "speak" ? "Sprechen" : "Anhören"}
                </Text>
              </View>
            </View>
          </Pressable>
        ) : (
          <View style={[styles.doneCard, { backgroundColor: c.good.bg, borderColor: c.good.border }]}>
            <PictureTile pic="🎉" size={96} tone="surface" />
            <View style={styles.nextBody}>
              <Text style={[styles.stepTitle, { color: c.good.text }]}>Level geschafft!</Text>
              <Text style={[styles.stepDetail, { color: c.good.text }]}>
                Nächste Lernstufe in den Einstellungen wählen.
              </Text>
            </View>
          </View>
        )}

        {/* Lernwelten des Levels - je nach Alter andere Kacheln. */}
        <Text style={[styles.sectionTitle, { color: c.text }]}>Deine Lernwelten</Text>
        <View style={styles.grid}>
          {worlds.map((world) => (
            <Pressable
              key={world.stage}
              onPress={() => router.push(world.route as any)}
              accessibilityRole="button"
              accessibilityLabel={world.title}
              style={({ pressed }) => [
                styles.worldCard,
                { backgroundColor: c.surface, borderColor: c.border },
                pressed && styles.pressed,
              ]}
            >
              <PictureTile pic={world.emoji} size={big ? 84 : 68} tone="muted" />
              <Text style={[styles.worldTitle, { color: c.text }]} numberOfLines={1}>
                {world.title}
              </Text>
              <View style={[styles.worldBarBg, { backgroundColor: c.surfaceMuted }]}>
                <View
                  style={[
                    styles.worldBarFill,
                    { backgroundColor: c.primary, width: `${world.ratio * 100}%` },
                  ]}
                />
              </View>
              {/* Zahlen sind fuer Eltern - Kinder sehen den Balken. */}
              {big ? null : (
                <Text style={[styles.worldMeta, { color: c.textMuted }]}>
                  {world.done} / {world.total}
                </Text>
              )}
            </Pressable>
          ))}
        </View>

        {/* Wortkategorien erst, wenn der Levelplan sie vorsieht (ab Level 7). */}
        {categories.length > 0 ? (
          <>
            <Text style={[styles.sectionTitle, { color: c.text }]}>Kategorien</Text>
            <View style={styles.grid}>
              {categories.map((cat) => {
                const items = WORDS[cat.id] ?? [];
                const done = items.filter(
                  (w) => (mastered[`${cat.id}:${w.ar}`] ?? 0) >= MASTERY_SCORE,
                ).length;
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
          </>
        ) : null}

        {/* Elternbereich: Zahlen, Lernplan und Abschlusskriterien. */}
        <Pressable
          onPress={() => router.push("/level" as any)}
          style={({ pressed }) => [
            styles.levelCard,
            { backgroundColor: c.surface, borderColor: c.border },
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.levelEmoji}>{plan.emoji}</Text>
          <View style={styles.nextBody}>
            <Text style={[styles.stepTitle, { color: c.text }]}>{plan.title}</Text>
            <View style={[styles.barBg, { backgroundColor: c.surfaceMuted }]}>
              <View
                style={[styles.barFill, { backgroundColor: c.primary, width: `${progress.ratio * 100}%` }]}
              />
            </View>
            <Text style={[styles.stepDetail, { color: c.textMuted }]}>
              Lvl {lv} · {xp} XP · {stars} ⭐ · {progress.done} / {progress.total} Inhalte
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={c.textMuted} />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loading: { alignItems: "center", flex: 1, justifyContent: "center" },
  root: { flex: 1 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
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
  scroll: { padding: 20, paddingTop: 4, gap: 14 },
  sectionTitle: { fontSize: 18, fontWeight: "700", marginTop: 4 },

  nextCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 26,
    padding: 16,
    minHeight: 148,
  },
  nextBody: { flex: 1, gap: 4 },
  nextKicker: { fontSize: 13, fontWeight: "700", opacity: 0.9, textTransform: "uppercase" },
  nextArabic: { fontSize: 40, lineHeight: 56, fontWeight: "700", writingDirection: "rtl" },
  nextHint: { fontSize: 14, opacity: 0.95 },
  nextGo: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 22,
    minHeight: 44,
  },
  nextGoText: { fontSize: 15, fontWeight: "800" },
  doneCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 26,
    borderWidth: 1.5,
    padding: 16,
  },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  gridItem: { width: "47%" },
  worldCard: {
    width: "47%",
    borderRadius: 22,
    borderWidth: 1,
    padding: 12,
    alignItems: "center",
    gap: 8,
  },
  worldTitle: { fontSize: 16, fontWeight: "700" },
  worldBarBg: { height: 8, borderRadius: 4, overflow: "hidden", alignSelf: "stretch" },
  worldBarFill: { height: "100%", borderRadius: 4 },
  worldMeta: { fontSize: 12 },

  levelCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
    marginTop: 4,
  },
  levelEmoji: { fontSize: 28 },
  barBg: { height: 8, borderRadius: 4, overflow: "hidden", marginVertical: 4 },
  barFill: { height: "100%", borderRadius: 4 },
  stepTitle: { fontSize: 16, fontWeight: "700" },
  stepDetail: { fontSize: 13, lineHeight: 18 },
});
