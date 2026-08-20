// Uebungsseite (Anforderungen 5: Uebungen, 5.4: Fehlerwerkstatt).
//
// Drei grosse Bildkacheln statt einer Textliste: was jetzt dran ist, was
// wiederholt werden soll und wo man nur zuhoert. Danach die offenen Inhalte -
// jeder Eintrag ist antippbar und fuehrt in genau die Uebung, die ihn prueft.
// Die ausformulierte Uebungsliste des Levels steht fuer Eltern in /level.

import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { drillWordForKey } from "@/data/wordSources";
import { PictureTile } from "@/components/PictureTile";
import { useProfile } from "@/store/useProfile";
import { useProgress } from "@/store/useProgress";
import { useTheme } from "@/store/useTheme";
import { drillRouteForItem, levelPlan, nextStep, reviewQueue } from "@/store/levelFlow";

export default function GamesScreen() {
  const router = useRouter();
  const c = useTheme();
  const profileLevel = useProfile((s) => s.profile?.level ?? 5);
  const mastered = useProgress((s) => s.wordsMastered);
  const heard = useProgress((s) => s.heard);

  const plan = levelPlan(profileLevel);
  const big = plan.ui.density === "large";
  const snapshot = { mastered, heard };
  const step = nextStep(profileLevel, snapshot);
  const queue = reviewQueue(profileLevel, snapshot, big ? 4 : 8);

  const stepRoute = step ? (drillRouteForItem(step.item) ?? step.path.route) : null;
  // Wiederholen startet beim schwaechsten Inhalt, der nicht schon "jetzt dran" ist.
  const repeatItem = queue.find((item) => item.key !== step?.item.key) ?? queue[0] ?? null;
  const repeatRoute = repeatItem ? drillRouteForItem(repeatItem) : null;

  const go = (route: string | null) => {
    if (route) router.push(route as any);
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={["top"]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: c.text }]}>🎮 Üben</Text>
        <Text style={[styles.sub, { color: c.textMuted }]}>Tippe auf ein Bild und leg los.</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.tiles}>
          <BigTile
            pic={step ? (drillWordForKey(step.item.key)?.pic ?? step.path.emoji) : "🎉"}
            label="Jetzt dran"
            disabled={!stepRoute}
            onPress={() => go(stepRoute)}
            tone="primary"
          />
          <BigTile
            pic="🔁"
            label="Wiederholen"
            disabled={!repeatRoute}
            onPress={() => go(repeatRoute)}
          />
          <BigTile pic="👂" label="Anhören" onPress={() => router.push("/letters" as any)} />
        </View>

        <Text style={[styles.sectionTitle, { color: c.text }]}>Das üben wir noch</Text>
        {queue.length === 0 ? (
          <View style={[styles.row, { backgroundColor: c.good.bg, borderColor: c.good.border }]}>
            <Text style={styles.rowEmoji}>✅</Text>
            <View style={styles.rowBody}>
              <Text style={[styles.rowTitle, { color: c.good.text }]}>Nichts offen</Text>
              <Text style={[styles.rowDetail, { color: c.good.text }]}>
                Alle Inhalte dieses Levels sitzen.
              </Text>
            </View>
          </View>
        ) : (
          queue.map((item) => {
            const route = drillRouteForItem(item);
            const speak = item.mode === "speak";
            return (
              <Pressable
                key={item.key}
                onPress={() => go(route)}
                disabled={!route}
                accessibilityRole="button"
                accessibilityLabel={`${item.hint ?? item.label} ${speak ? "sprechen" : "anhören"}`}
                style={({ pressed }) => [
                  styles.row,
                  { backgroundColor: c.surface, borderColor: c.border },
                  !route && styles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                <PictureTile
                  pic={drillWordForKey(item.key)?.pic}
                  fallback={speak ? "🎙️" : "👂"}
                  size={big ? 72 : 56}
                  tone="muted"
                />
                <View style={styles.rowBody}>
                  <Text style={[styles.rowArabic, { color: c.text }]} numberOfLines={1}>
                    {item.label}
                  </Text>
                  <Text style={[styles.rowTitle, { color: c.text }]} numberOfLines={1}>
                    {item.hint ?? item.stage}
                  </Text>
                  <Text style={[styles.rowDetail, { color: c.textMuted }]}>
                    {speak ? "Sprechen" : "Anhören"}
                  </Text>
                </View>
                <Ionicons
                  name={speak ? "mic" : "volume-high"}
                  size={24}
                  color={route ? c.primary : c.textMuted}
                />
              </Pressable>
            );
          })
        )}

        <Pressable
          onPress={() => router.push("/level" as any)}
          style={({ pressed }) => [
            styles.linkBtn,
            { backgroundColor: c.surface, borderColor: c.border },
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="map-outline" size={18} color={c.text} />
          <Text style={[styles.linkBtnText, { color: c.text }]}>
            Für Eltern: Lernplan und Übungen
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function BigTile({
  pic,
  label,
  onPress,
  disabled,
  tone = "surface",
}: {
  pic: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "surface" | "primary";
}) {
  const c = useTheme();
  const primary = tone === "primary";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.tile,
        {
          backgroundColor: primary ? c.primary : c.surface,
          borderColor: primary ? c.primary : c.border,
        },
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <PictureTile pic={pic} size={72} tone={primary ? "surface" : "muted"} />
      <Text style={[styles.tileLabel, { color: primary ? c.onPrimary : c.text }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  title: { fontSize: 24, fontWeight: "700" },
  sub: { marginTop: 2, fontSize: 14 },
  scroll: { padding: 20, paddingTop: 8, gap: 10 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.45 },

  tiles: { flexDirection: "row", gap: 10 },
  tile: {
    flex: 1,
    borderRadius: 22,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: "center",
    gap: 8,
    minHeight: 140,
    justifyContent: "center",
  },
  tileLabel: { fontSize: 15, fontWeight: "800", textAlign: "center" },

  sectionTitle: { fontSize: 17, fontWeight: "700", marginTop: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
    minHeight: 84,
  },
  rowEmoji: { fontSize: 28 },
  rowBody: { flex: 1, gap: 2 },
  rowArabic: { fontSize: 26, lineHeight: 38, writingDirection: "rtl" },
  rowTitle: { fontSize: 15, fontWeight: "700" },
  rowDetail: { fontSize: 13, lineHeight: 18 },
  linkBtn: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 24,
    borderWidth: 1,
  },
  linkBtnText: { fontWeight: "700", fontSize: 15 },
});
