// Lernplan des aktuellen Levels: Ziel, Lernpfade mit echtem Fortschritt,
// Uebungen und Abschlusskriterium (Anforderungen 5 und 16).

import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useProfile } from "@/store/useProfile";
import { useProgress } from "@/store/useProgress";
import { useTheme } from "@/store/useTheme";
import {
  drillRouteForItem,
  levelPlan,
  levelProgress,
  levelsInOrder,
  nextStep,
  type PathProgress,
} from "@/store/levelFlow";
import type { ThemePalette } from "@/store/profileModel";

export default function LevelScreen() {
  const router = useRouter();
  const c = useTheme();
  const profile = useProfile((s) => s.profile);
  const mastered = useProgress((s) => s.wordsMastered);
  const heard = useProgress((s) => s.heard);

  const current = profile?.level ?? 5;
  const plan = levelPlan(current);
  const snapshot = { mastered, heard };
  const progress = levelProgress(current, snapshot);
  const step = nextStep(current, snapshot);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={[styles.iconBtn, { backgroundColor: c.surface, borderColor: c.border }]}
          hitSlop={10}
          accessibilityLabel="Zurück"
        >
          <Ionicons name="chevron-back" size={22} color={c.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerEmoji}>{plan.emoji}</Text>
          <Text style={[styles.headerTitle, { color: c.text }]} numberOfLines={1}>
            {plan.level}. Lernlevel
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { backgroundColor: c.primary }]}>
          <Text style={[styles.heroTitle, { color: c.onPrimary }]}>{plan.title}</Text>
          <Text style={[styles.heroGoal, { color: c.onPrimary }]}>{plan.goal}</Text>
          <View style={[styles.barBg, { backgroundColor: c.onPrimary, opacity: 0.35 }]}>
            <View style={[styles.barFill, { backgroundColor: c.onPrimary, width: `${progress.ratio * 100}%` }]} />
          </View>
          <Text style={[styles.heroMeta, { color: c.onPrimary }]}>
            {progress.done} von {progress.total} Inhalten · {Math.round(progress.ratio * 100)} %
          </Text>
        </View>

        {step ? (
          <Pressable
            onPress={() => router.push((drillRouteForItem(step.item) ?? step.path.route) as any)}
            style={[styles.card, { backgroundColor: c.surface, borderColor: c.primary }]}
          >
            <Text style={[styles.kicker, { color: c.info }]}>Nächster Lernschritt</Text>
            <Text style={[styles.cardTitle, { color: c.text }]}>
              {step.path.emoji} {step.path.title}
            </Text>
            <Text style={[styles.arabic, { color: c.text }]}>{step.item.label}</Text>
            {step.item.hint ? (
              <Text style={[styles.detail, { color: c.textMuted }]}>{step.item.hint}</Text>
            ) : null}
            <Text style={[styles.detail, { color: c.textMuted }]}>
              Aufgabe {step.position} von {step.total}
            </Text>
          </Pressable>
        ) : (
          <View style={[styles.card, { backgroundColor: c.good.bg, borderColor: c.good.border }]}>
            <Text style={[styles.cardTitle, { color: c.good.text }]}>🎉 Level geschafft!</Text>
            <Text style={[styles.detail, { color: c.good.text }]}>
              Alle Inhalte dieses Levels sitzen. In den Einstellungen kann das nächste Level gewählt werden.
            </Text>
          </View>
        )}

        <Text style={[styles.sectionTitle, { color: c.text }]}>Lernpfade</Text>
        {progress.paths.map((entry) => (
          <PathRow key={entry.path.id} entry={entry} colors={c} onPress={() => router.push(entry.path.route as any)} />
        ))}

        <Text style={[styles.sectionTitle, { color: c.text }]}>Übungen in diesem Level</Text>
        {plan.exercises.map((exercise) => (
          <View
            key={exercise.id}
            style={[styles.row, { backgroundColor: c.surface, borderColor: c.border }]}
          >
            <Text style={styles.rowEmoji}>{exercise.emoji}</Text>
            <View style={styles.rowBody}>
              <Text style={[styles.rowTitle, { color: c.text }]}>{exercise.title}</Text>
              <Text style={[styles.detail, { color: c.textMuted }]}>{exercise.hint}</Text>
            </View>
          </View>
        ))}

        <Text style={[styles.sectionTitle, { color: c.text }]}>Abschlusskriterium</Text>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={[styles.detail, { color: c.text }]}>{plan.mastery.label}</Text>
          <View style={styles.goalList}>
            {plan.mastery.goals.map((goal) => (
              <View key={goal.label} style={styles.goalRow}>
                <Text style={[styles.detail, { color: c.textMuted, flex: 1 }]}>{goal.label}</Text>
                <Text style={[styles.goalValue, { color: c.text }]}>
                  {goal.metric === "score"
                    ? `${goal.value} %`
                    : goal.metric === "days"
                      ? `${goal.value} Tage`
                      : goal.metric === "recordings"
                        ? `${goal.value}×`
                        : goal.value}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: c.text }]}>Alle Lernlevel</Text>
        {levelsInOrder().map((entry) => {
          const active = entry.level === plan.level;
          return (
            <View
              key={entry.level}
              style={[
                styles.row,
                { backgroundColor: active ? c.surfaceMuted : c.surface, borderColor: active ? c.primary : c.border },
              ]}
            >
              <Text style={styles.rowEmoji}>{entry.emoji}</Text>
              <View style={styles.rowBody}>
                <Text style={[styles.rowTitle, { color: c.text }]}>
                  {entry.level}. Level · {entry.title}
                </Text>
                <Text style={[styles.detail, { color: c.textMuted }]}>{entry.summary}</Text>
              </View>
              {active ? <Ionicons name="checkmark-circle" size={20} color={c.primary} /> : null}
            </View>
          );
        })}

        <Pressable
          onPress={() => router.push("/settings" as any)}
          style={[styles.primaryBtn, { backgroundColor: c.primary }]}
        >
          <Ionicons name="options-outline" size={18} color={c.onPrimary} />
          <Text style={[styles.primaryBtnText, { color: c.onPrimary }]}>Lernstufe ändern</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function PathRow({
  entry,
  colors,
  onPress,
}: {
  entry: PathProgress;
  colors: ThemePalette;
  onPress: () => void;
}) {
  const complete = entry.total > 0 && entry.done === entry.total;
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.row,
        { backgroundColor: colors.surface, borderColor: complete ? colors.good.base : colors.border },
      ]}
    >
      <Text style={styles.rowEmoji}>{entry.path.emoji}</Text>
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, { color: colors.text }]}>{entry.path.title}</Text>
        <Text style={[styles.detail, { color: colors.textMuted }]}>{entry.path.detail}</Text>
        <View style={[styles.smallBarBg, { backgroundColor: colors.surfaceMuted }]}>
          <View
            style={[
              styles.smallBarFill,
              {
                backgroundColor: complete ? colors.good.base : colors.primary,
                width: `${entry.ratio * 100}%`,
              },
            ]}
          />
        </View>
        <Text style={[styles.detail, { color: colors.textMuted }]}>
          {entry.total > 0
            ? `${entry.done} / ${entry.total} geschafft`
            : `${entry.path.count} Inhalte · kommt später dazu`}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  headerCenter: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  headerEmoji: { fontSize: 22 },
  headerTitle: { fontSize: 17, fontWeight: "700", flexShrink: 1 },
  scroll: { paddingHorizontal: 16, paddingBottom: 32, gap: 10 },

  hero: { borderRadius: 22, padding: 18, gap: 8 },
  heroTitle: { fontSize: 22, fontWeight: "800" },
  heroGoal: { fontSize: 14, lineHeight: 20, opacity: 0.95 },
  heroMeta: { fontSize: 13, fontWeight: "600", opacity: 0.95 },
  barBg: { height: 10, borderRadius: 5, overflow: "hidden", marginTop: 4 },
  barFill: { height: "100%", borderRadius: 5 },

  card: { borderRadius: 18, borderWidth: 1.5, padding: 16, gap: 6 },
  kicker: { fontSize: 12, fontWeight: "800", letterSpacing: 0.6, textTransform: "uppercase" },
  cardTitle: { fontSize: 17, fontWeight: "700" },
  arabic: { fontSize: 44, lineHeight: 64, writingDirection: "rtl" },
  detail: { fontSize: 13, lineHeight: 19 },

  sectionTitle: { fontSize: 17, fontWeight: "700", marginTop: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, borderWidth: 1.5, padding: 12 },
  rowEmoji: { fontSize: 24 },
  rowBody: { flex: 1, gap: 3 },
  rowTitle: { fontSize: 15, fontWeight: "700" },
  smallBarBg: { height: 6, borderRadius: 3, overflow: "hidden", marginTop: 2 },
  smallBarFill: { height: "100%", borderRadius: 3 },

  goalList: { marginTop: 6, gap: 4 },
  goalRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  goalValue: { fontSize: 13, fontWeight: "700", fontVariant: ["tabular-nums"] },

  primaryBtn: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 26,
  },
  primaryBtnText: { fontWeight: "700", fontSize: 16 },
});
